import { LLMService } from '../../../../lib/llm/dist/index.js';
import { logger, PerformanceTimer } from '../utils/logger.js';

/**
 * Configurable Semantic Constraint Validator
 *
 * Delegates LLM calls to the unified LLMService from lib/llm/.
 * Keeps domain logic: prompt building, response parsing, constraint routing.
 *
 * Usage:
 *   const validator = new SemanticValidator(config);
 *   const result = await validator.validateConstraint(constraintId, regexMatch, context);
 */
export class SemanticValidator {
  constructor(config = {}) {
    this.config = config;

    // Model routing: maps constraint IDs to provider/model specs
    // Format: 'provider/model-name'
    this.modelRouting = config.modelRouting || {
      // Code structure analysis - use fast Groq models
      'no-evolutionary-names': 'groq/llama-3.3-70b-versatile',
      'no-parallel-files': 'groq/llama-3.3-70b-versatile',

      // Security analysis - use Anthropic for best safety understanding
      'no-hardcoded-secrets': 'anthropic/claude-haiku-4-5',
      'no-eval-usage': 'anthropic/claude-haiku-4-5',

      // Language/intent analysis - balanced models
      'debug-not-speculate': 'groq/llama-3.3-70b-versatile',
      'proper-error-handling': 'gemini/gemini-2.5-flash',

      // Default fallback
      'default': 'groq/llama-3.3-70b-versatile'
    };

    // Performance tracking
    this.stats = {
      totalValidations: 0,
      byProvider: {},
      byConstraint: {},
      averageLatency: 0
    };

    // Initialize LLM service (with per-constraint model routing)
    this.llmService = new LLMService({
      modelRouting: this.modelRouting,
      cache: { maxSize: config.cacheMaxSize || 1000, ttlMs: config.cacheTTL || 3600000 },
      circuitBreaker: { threshold: 5, resetTimeoutMs: 60000 },
    });
    this.llmInitialized = false;
  }

  /**
   * Ensure LLM service is initialized
   */
  async ensureInitialized() {
    if (!this.llmInitialized) {
      await this.llmService.initialize();
      this.llmInitialized = true;
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
      await this.ensureInitialized();

      this.stats.totalValidations++;

      const prompt = this.buildValidationPrompt(constraintId, regexMatch, context);

      // Delegate to LLMService with per-constraint routing
      const result = await this.llmService.completeWithRouting(prompt, constraintId, {
        maxTokens: 200,
        temperature: 0.1,
        responseFormat: { type: 'json_object' },
      });

      // Parse the LLM response
      const parsed = this.parseValidationResponse(result.content);

      // Update stats
      const duration = timer.duration;
      this.updateStats(result.provider, constraintId, duration);

      timer.end('completed');

      // Warn if too slow
      if (duration > 300) {
        logger.warn(`Slow semantic validation: ${duration}ms`, {
          constraintId,
          provider: result.provider,
          model: result.model
        });
      }

      return parsed;

    } catch (error) {
      timer.end('failed', { error: error.message });
      logger.error('Semantic validation failed:', error);

      // Return fallback (accept regex match)
      return this.createFallbackResult(true);
    }
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
    const llmStats = this.llmService.getStats();
    return {
      ...this.stats,
      cache: llmStats.cache,
      providers: this.llmService.getAvailableProviders(),
      circuitBreaker: llmStats.circuitBreaker
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.llmService.clearCache();
    logger.info('Semantic validator cache cleared');
  }
}
