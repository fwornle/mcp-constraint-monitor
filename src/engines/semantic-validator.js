import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger, PerformanceTimer } from '../utils/logger.js';

/**
 * Configurable Semantic Constraint Validator
 * Supports multiple model providers: Groq, Anthropic, Gemini
 *
 * Usage:
 *   const validator = new SemanticValidator(config);
 *   const result = await validator.validateConstraint(constraintId, regexMatch, context);
 */
export class SemanticValidator {
  constructor(config = {}) {
    this.config = config;

    // Initialize providers based on available API keys
    this.providers = {};
    this.initializeProviders();

    // Model routing: maps constraint IDs to provider/model specs
    // Format: 'provider/model-name'
    this.modelRouting = config.modelRouting || {
      // Code structure analysis - use fast Groq models
      'no-evolutionary-names': 'groq/llama-3.3-70b-versatile',
      'no-parallel-files': 'groq/qwen-2.5-32b-instruct',

      // Security analysis - use Anthropic for best safety understanding
      'no-hardcoded-secrets': 'anthropic/claude-3-haiku-20240307',
      'no-eval-usage': 'anthropic/claude-3-haiku-20240307',

      // Language/intent analysis - balanced models
      'debug-not-speculate': 'groq/llama-3.3-70b-versatile',
      'proper-error-handling': 'gemini/gemini-1.5-flash',

      // Default fallback
      'default': 'groq/llama-3.3-70b-versatile'
    };

    // LRU cache for validation results (1 hour TTL)
    this.cache = new Map();
    this.cacheMaxSize = config.cacheMaxSize || 1000;
    this.cacheTTL = config.cacheTTL || 3600000; // 1 hour
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Circuit breaker for provider failures
    this.circuitBreaker = {
      failures: {},
      threshold: 5,
      resetTimeout: 60000 // 1 minute
    };

    // Performance tracking
    this.stats = {
      totalValidations: 0,
      byProvider: {},
      byConstraint: {},
      averageLatency: 0
    };
  }

  initializeProviders() {
    // Groq provider (supports multiple Groq models)
    if (process.env.GROK_API_KEY || this.config.groqApiKey) {
      try {
        this.providers.groq = new Groq({
          apiKey: this.config.groqApiKey || process.env.GROK_API_KEY,
          timeout: 10000
        });
        logger.info('Groq provider initialized');
      } catch (error) {
        logger.warn('Failed to initialize Groq provider:', error);
      }
    }

    // Anthropic provider
    if (process.env.ANTHROPIC_API_KEY || this.config.anthropicApiKey) {
      try {
        this.providers.anthropic = new Anthropic({
          apiKey: this.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
          timeout: 10000
        });
        logger.info('Anthropic provider initialized');
      } catch (error) {
        logger.warn('Failed to initialize Anthropic provider:', error);
      }
    }

    // Gemini provider
    if (process.env.GOOGLE_API_KEY || this.config.geminiApiKey) {
      try {
        this.providers.gemini = new GoogleGenerativeAI(
          this.config.geminiApiKey || process.env.GOOGLE_API_KEY
        );
        logger.info('Gemini provider initialized');
      } catch (error) {
        logger.warn('Failed to initialize Gemini provider:', error);
      }
    }

    if (Object.keys(this.providers).length === 0) {
      logger.warn('No semantic validation providers initialized - will use regex-only mode');
    }
  }

  /**
   * Validate a constraint match using semantic analysis
   *
   * @param {string} constraintId - Constraint identifier
   * @param {object} regexMatch - Regex match object with matches array
   * @param {object} context - Context including content, filePath, constraint details
   * @returns {Promise<object>} Validation result with isViolation, confidence, reasoning
   */
  async validateConstraint(constraintId, regexMatch, context) {
    const timer = new PerformanceTimer(`semantic-validation-${constraintId}`);

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(constraintId, context);
      const cached = this.getFromCache(cacheKey);

      if (cached) {
        this.cacheHits++;
        timer.end('completed (cached)');
        return cached;
      }

      this.cacheMisses++;
      this.stats.totalValidations++;

      // Get model spec for this constraint
      const modelSpec = this.getModelForConstraint(constraintId);
      const [provider, model] = modelSpec.split('/');

      // Check circuit breaker
      if (this.isCircuitOpen(provider)) {
        logger.warn(`Circuit breaker open for ${provider}, falling back to regex-only`);
        return this.createFallbackResult(true); // Accept regex match
      }

      // Route to appropriate provider
      let result;

      switch (provider) {
        case 'groq':
          result = await this.validateWithGroq(model, constraintId, regexMatch, context);
          break;
        case 'anthropic':
          result = await this.validateWithAnthropic(model, constraintId, regexMatch, context);
          break;
        case 'gemini':
          result = await this.validateWithGemini(model, constraintId, regexMatch, context);
          break;
        default:
          logger.warn(`Unknown provider: ${provider}, falling back to regex-only`);
          return this.createFallbackResult(true);
      }

      // Update stats
      this.updateStats(provider, constraintId, timer.duration);

      // Cache result
      this.setInCache(cacheKey, result);

      // Record success for circuit breaker
      this.recordSuccess(provider);

      const duration = timer.end('completed');

      // Warn if too slow
      if (duration > 300) {
        logger.warn(`Slow semantic validation: ${duration}ms`, {
          constraintId,
          provider,
          model
        });
      }

      return result;

    } catch (error) {
      timer.end('failed', { error: error.message });
      logger.error('Semantic validation failed:', error);

      // Record failure for circuit breaker
      const modelSpec = this.getModelForConstraint(constraintId);
      const [provider] = modelSpec.split('/');
      this.recordFailure(provider);

      // Return fallback (accept regex match)
      return this.createFallbackResult(true);
    }
  }

  /**
   * Validate using Groq models (llama, qwen, gpt-oss, etc.)
   */
  async validateWithGroq(model, constraintId, regexMatch, context) {
    if (!this.providers.groq) {
      throw new Error('Groq provider not initialized');
    }

    const prompt = this.buildValidationPrompt(constraintId, regexMatch, context);

    const completion = await this.providers.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model,
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    return this.parseValidationResponse(completion.choices[0].message.content);
  }

  /**
   * Validate using Anthropic Claude models
   */
  async validateWithAnthropic(model, constraintId, regexMatch, context) {
    if (!this.providers.anthropic) {
      throw new Error('Anthropic provider not initialized');
    }

    const prompt = this.buildValidationPrompt(constraintId, regexMatch, context);

    const message = await this.providers.anthropic.messages.create({
      model: model,
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    return this.parseValidationResponse(message.content[0].text);
  }

  /**
   * Validate using Google Gemini models
   */
  async validateWithGemini(model, constraintId, regexMatch, context) {
    if (!this.providers.gemini) {
      throw new Error('Gemini provider not initialized');
    }

    const prompt = this.buildValidationPrompt(constraintId, regexMatch, context);

    const geminiModel = this.providers.gemini.getGenerativeModel({
      model: model,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: 'application/json'
      }
    });

    const result = await geminiModel.generateContent(prompt);
    const response = result.response.text();

    return this.parseValidationResponse(response);
  }

  /**
   * Build validation prompt for semantic analysis
   */
  buildValidationPrompt(constraintId, regexMatch, context) {
    const { content, filePath, constraint } = context;

    // Extract relevant context around the match
    const matchedText = regexMatch.matches ? regexMatch.matches[0] : '';
    const matchIndex = content.indexOf(matchedText);
    const contextBefore = content.substring(Math.max(0, matchIndex - 200), matchIndex);
    const contextAfter = content.substring(matchIndex + matchedText.length, matchIndex + matchedText.length + 200);

    return `You are validating a potential constraint violation.

CONSTRAINT: ${constraint.message}
PATTERN MATCHED: "${matchedText}"
FILE: ${filePath || 'unknown'}

CONTEXT:
...${contextBefore}
>>> ${matchedText} <<<
${contextAfter}...

QUESTION: Is this a TRUE violation of the constraint, or a FALSE POSITIVE?

Consider:
- The intent and purpose of the matched code
- Whether this is test code, examples, or legitimate use
- The broader context of what the code is trying to achieve
- If this creates the actual problem the constraint is trying to prevent

Respond with JSON only:
{
  "isViolation": true|false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of your determination"
}`;
  }

  /**
   * Parse validation response from any provider
   */
  parseValidationResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        isViolation: Boolean(parsed.isViolation),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        semanticOverride: !parsed.isViolation, // If not a violation, we're overriding regex
        rawResponse: response
      };

    } catch (error) {
      logger.warn('Failed to parse validation response:', { error: error.message, response });

      // On parse failure, assume regex was correct
      return this.createFallbackResult(true);
    }
  }

  /**
   * Get model spec for a constraint
   */
  getModelForConstraint(constraintId) {
    return this.modelRouting[constraintId] || this.modelRouting.default;
  }

  /**
   * Cache management
   */
  getCacheKey(constraintId, context) {
    const hash = this.simpleHash(context.content || '');
    return `${constraintId}:${hash}:${context.filePath || 'unknown'}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }
    return null;
  }

  setInCache(key, result) {
    // Implement LRU eviction
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * Circuit breaker management
   */
  isCircuitOpen(provider) {
    const failures = this.circuitBreaker.failures[provider] || 0;
    if (failures >= this.circuitBreaker.threshold) {
      // Check if reset timeout has passed
      const lastFailure = this.circuitBreaker[`${provider}_lastFailure`] || 0;
      if (Date.now() - lastFailure > this.circuitBreaker.resetTimeout) {
        // Reset circuit
        this.circuitBreaker.failures[provider] = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure(provider) {
    this.circuitBreaker.failures[provider] = (this.circuitBreaker.failures[provider] || 0) + 1;
    this.circuitBreaker[`${provider}_lastFailure`] = Date.now();
  }

  recordSuccess(provider) {
    this.circuitBreaker.failures[provider] = 0;
  }

  /**
   * Stats tracking
   */
  updateStats(provider, constraintId, duration) {
    if (!this.stats.byProvider[provider]) {
      this.stats.byProvider[provider] = { count: 0, totalLatency: 0 };
    }
    this.stats.byProvider[provider].count++;
    this.stats.byProvider[provider].totalLatency += duration;

    if (!this.stats.byConstraint[constraintId]) {
      this.stats.byConstraint[constraintId] = { count: 0, totalLatency: 0 };
    }
    this.stats.byConstraint[constraintId].count++;
    this.stats.byConstraint[constraintId].totalLatency += duration;

    // Update average
    const totalLatency = Object.values(this.stats.byProvider).reduce((sum, p) => sum + p.totalLatency, 0);
    this.stats.averageLatency = totalLatency / this.stats.totalValidations;
  }

  /**
   * Create fallback result when semantic validation unavailable
   */
  createFallbackResult(acceptRegexMatch) {
    return {
      isViolation: acceptRegexMatch,
      confidence: 0.5,
      reasoning: 'Fallback to regex-only (semantic validation unavailable)',
      semanticOverride: false,
      fallback: true
    };
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      ...this.stats,
      cache: {
        size: this.cache.size,
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
      },
      providers: Object.keys(this.providers),
      circuitBreaker: this.circuitBreaker.failures
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.info('Semantic validator cache cleared');
  }
}
