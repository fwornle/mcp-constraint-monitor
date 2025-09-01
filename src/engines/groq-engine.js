import Groq from 'groq-sdk';
import { logger, PerformanceTimer } from '../utils/logger.js';

export class GroqSemanticEngine {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
      model: config.model || 'mixtral-8x7b-32768', // 1000+ tokens/sec
      maxTokens: config.maxTokens || 200,
      temperature: config.temperature || 0.1,
      timeout: config.timeout || 10000, // 10s timeout
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required');
    }

    this.groq = new Groq({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout
    });

    // Analysis cache for repeated patterns
    this.analysisCache = new Map();
    this.cacheMaxSize = 1000;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Analyze a coding interaction for constraint violations and trajectory alignment
   * Target: <50ms analysis time
   */
  async analyzeInteraction(event, context) {
    const timer = new PerformanceTimer('groq-analysis');
    
    try {
      // Check cache first for performance
      const cacheKey = this.createCacheKey(event, context);
      const cached = this.analysisCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
        this.cacheHits++;
        timer.end('completed (cached)', { cacheHits: this.cacheHits, cacheMisses: this.cacheMisses });
        return cached.result;
      }

      this.cacheMisses++;

      // Construct optimized prompt for fast analysis
      const prompt = this.buildAnalysisPrompt(event, context);
      
      const completion = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stop: ["###", "---"] // Early stopping for performance
      });

      const analysis = this.parseAnalysisResponse(completion.choices[0].message.content);
      
      // Cache the result
      if (this.analysisCache.size >= this.cacheMaxSize) {
        // Simple LRU: remove oldest entry
        const firstKey = this.analysisCache.keys().next().value;
        this.analysisCache.delete(firstKey);
      }
      
      this.analysisCache.set(cacheKey, {
        result: analysis,
        timestamp: Date.now()
      });

      const duration = timer.end('completed', { 
        tokenCount: completion.usage?.total_tokens || 0,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses
      });

      // Log performance warning if too slow
      if (duration > 100) {
        logger.warn(`Slow Groq analysis: ${duration}ms`, { event: event.type, model: this.config.model });
      }

      return analysis;
    } catch (error) {
      timer.end('failed', { error: error.message });
      logger.error('Groq analysis failed:', error);
      
      // Return default analysis on failure
      return this.getDefaultAnalysis(event);
    }
  }

  buildAnalysisPrompt(event, context) {
    // Optimized prompt for speed and accuracy
    return `ANALYZE CODING ACTION (respond in <100 tokens):

CONTEXT:
- Session: ${context.summary || 'New session'}  
- Active constraints: ${context.constraints?.slice(0, 3).join(', ') || 'None'}
- User intent: ${context.userIntent || 'Unknown'}
- Phase: ${context.currentPhase || 'exploration'}

CURRENT ACTION:
- Type: ${event.type}
- Agent: ${event.agent}
- Content: ${event.content?.substring(0, 200) || ''}${event.content?.length > 200 ? '...' : ''}

EVALUATE (JSON format):
{
  "intentAlignment": [1-10 score],
  "constraintViolations": ["violation_type", ...],
  "trajectoryStatus": "on_track|exploring|off_track|blocked",
  "nextPhase": "exploration|planning|implementation|verification",
  "riskScore": [0.0-1.0],
  "reasoning": "brief explanation"
}

Focus on:
1. Does action align with user intent?
2. Any constraint violations?
3. Is agent making progress toward goal?
4. What should happen next?

Response (JSON only):`;
  }

  parseAnalysisResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      return {
        intentAlignment: Math.max(1, Math.min(10, analysis.intentAlignment || 5)),
        constraintViolations: Array.isArray(analysis.constraintViolations) ? analysis.constraintViolations : [],
        trajectoryStatus: analysis.trajectoryStatus || 'exploring',
        nextPhase: analysis.nextPhase || 'exploration',
        riskScore: Math.max(0, Math.min(1, analysis.riskScore || 0.1)),
        reasoning: analysis.reasoning || 'Analysis completed',
        rawResponse: response
      };
    } catch (error) {
      logger.warn('Failed to parse Groq analysis response:', { error: error.message, response });
      
      // Fallback analysis
      return {
        intentAlignment: 5,
        constraintViolations: [],
        trajectoryStatus: 'exploring',
        nextPhase: 'exploration', 
        riskScore: 0.1,
        reasoning: 'Parsing failed, using default analysis',
        rawResponse: response
      };
    }
  }

  /**
   * Fast constraint evaluation using pattern matching + semantic analysis
   */
  async evaluateConstraints(event, constraints, context) {
    const timer = new PerformanceTimer('constraint-evaluation');
    
    try {
      const violations = [];
      
      // Fast pattern-based checks first (no API call needed)
      for (const constraint of constraints) {
        if (constraint.type === 'pattern' || constraint.type === 'anti-pattern') {
          const violation = this.checkPatternConstraint(event, constraint);
          if (violation) {
            violations.push(violation);
          }
        }
      }

      // Semantic analysis for complex constraints
      const semanticConstraints = constraints.filter(c => c.type === 'semantic' || c.type === 'workflow');
      
      if (semanticConstraints.length > 0) {
        const semanticAnalysis = await this.analyzeSemanticConstraints(event, semanticConstraints, context);
        violations.push(...semanticAnalysis);
      }

      timer.end('completed', { violationCount: violations.length });
      return violations;
    } catch (error) {
      timer.end('failed', { error: error.message });
      logger.error('Constraint evaluation failed:', error);
      return [];
    }
  }

  checkPatternConstraint(event, constraint) {
    try {
      const pattern = new RegExp(constraint.matcher, 'gi');
      const matches = event.content?.match(pattern);
      
      if (matches) {
        return {
          constraintId: constraint.id,
          type: constraint.type,
          severity: constraint.severity || 'warning',
          message: constraint.message || `Pattern violation: ${constraint.matcher}`,
          matches: matches.slice(0, 3), // Limit for performance
          correctionAction: constraint.correctionAction || 'warn'
        };
      }
    } catch (error) {
      logger.warn(`Invalid regex pattern in constraint ${constraint.id}:`, error);
    }
    
    return null;
  }

  async analyzeSemanticConstraints(event, constraints, context) {
    const prompt = `CONSTRAINT VIOLATION CHECK:

ACTION: ${event.type} - ${event.content?.substring(0, 150)}
CONTEXT: ${context.summary || 'No context'}

ACTIVE CONSTRAINTS:
${constraints.map((c, i) => `${i+1}. ${c.id}: ${c.description || c.message}`).join('\n')}

Check if the action violates any constraints. Consider:
- User's stated preferences and restrictions
- Workflow appropriateness (right time for this action?)
- Intent alignment (does this help achieve the goal?)

Respond with JSON array of violations (empty if none):
[
  {
    "constraintId": "constraint_id",
    "severity": "error|warning|info", 
    "message": "specific violation description",
    "confidence": 0.0-1.0
  }
]`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: this.config.model,
        max_tokens: 150,
        temperature: 0.1
      });

      const response = completion.choices[0].message.content;
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        return [];
      }
    } catch (error) {
      logger.warn('Semantic constraint analysis failed:', error);
      return [];
    }
  }

  createCacheKey(event, context) {
    // Create hash-like key for caching similar events
    const keyData = {
      type: event.type,
      agent: event.agent,
      contentHash: this.simpleHash(event.content || ''),
      constraintIds: context.constraints?.map(c => c.id).sort() || [],
      phase: context.currentPhase
    };
    
    return JSON.stringify(keyData);
  }

  simpleHash(str) {
    // Simple hash for content deduplication
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  getDefaultAnalysis(event) {
    return {
      intentAlignment: 5,
      constraintViolations: [],
      trajectoryStatus: 'exploring',
      nextPhase: 'exploration',
      riskScore: 0.1,
      reasoning: 'Default analysis due to service failure'
    };
  }

  /**
   * Health check for Groq service
   */
  async healthCheck() {
    try {
      const timer = new PerformanceTimer('groq-health-check');
      
      const completion = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: "Respond with 'OK' if you're working." }],
        model: this.config.model,
        max_tokens: 5,
        temperature: 0
      });

      const duration = timer.end('completed');
      const isHealthy = completion.choices[0].message.content.includes('OK');
      
      return {
        healthy: isHealthy,
        latency: duration,
        model: this.config.model,
        cacheStats: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
        }
      };
    } catch (error) {
      logger.error('Groq health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        model: this.config.model
      };
    }
  }

  clearCache() {
    this.analysisCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.info('Groq analysis cache cleared');
  }

  getStats() {
    return {
      model: this.config.model,
      cacheSize: this.analysisCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }
}