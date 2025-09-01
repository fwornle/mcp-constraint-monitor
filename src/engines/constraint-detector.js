import { logger, PerformanceTimer, violationLogger } from '../utils/logger.js';
import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';

export class ConstraintDetector {
  constructor(config = {}) {
    this.config = {
      constraintsFile: config.constraintsFile || './config/constraints.yaml',
      updateInterval: config.updateInterval || 60000, // 1 minute
      cacheEnabled: config.cacheEnabled !== false,
      ...config
    };

    this.constraints = new Map();
    this.constraintsByType = new Map();
    this.ruleCache = new Map();
    this.violationHistory = new Map();
    this.lastUpdate = 0;

    // Load initial constraints
    this.loadConstraints();

    // Set up auto-reload
    if (this.config.updateInterval > 0) {
      setInterval(() => this.loadConstraints(), this.config.updateInterval);
    }
  }

  /**
   * Load constraint rules from configuration
   */
  loadConstraints() {
    try {
      if (!existsSync(this.config.constraintsFile)) {
        logger.warn(`Constraints file not found: ${this.config.constraintsFile}`);
        this.initializeDefaultConstraints();
        return;
      }

      const constraintsData = readFileSync(this.config.constraintsFile, 'utf8');
      const config = parse(constraintsData);
      
      if (!config.constraints || !Array.isArray(config.constraints)) {
        throw new Error('Invalid constraints file format: missing constraints array');
      }

      // Clear existing constraints
      this.constraints.clear();
      this.constraintsByType.clear();
      this.ruleCache.clear();

      // Load new constraints
      for (const constraint of config.constraints) {
        if (!constraint.id) {
          logger.warn('Skipping constraint without id:', constraint);
          continue;
        }

        // Validate and normalize constraint
        const normalizedConstraint = this.normalizeConstraint(constraint);
        this.constraints.set(constraint.id, normalizedConstraint);

        // Index by type for performance
        if (!this.constraintsByType.has(constraint.type)) {
          this.constraintsByType.set(constraint.type, []);
        }
        this.constraintsByType.get(constraint.type).push(normalizedConstraint);
      }

      this.lastUpdate = Date.now();
      logger.info(`Loaded ${this.constraints.size} constraint rules`);
    } catch (error) {
      logger.error('Failed to load constraints:', error);
      if (this.constraints.size === 0) {
        this.initializeDefaultConstraints();
      }
    }
  }

  normalizeConstraint(constraint) {
    return {
      id: constraint.id,
      type: constraint.type || 'pattern',
      severity: constraint.severity || 'warning',
      matcher: constraint.matcher,
      message: constraint.message || `Constraint violation: ${constraint.id}`,
      correctionAction: constraint.correctionAction || 'warn',
      enabled: constraint.enabled !== false,
      context: constraint.context || [],
      threshold: constraint.threshold || 0.8,
      cooldown: constraint.cooldown || 0, // Seconds between repeat violations
      maxViolationsPerSession: constraint.maxViolationsPerSession || Infinity,
      description: constraint.description,
      examples: constraint.examples || [],
      autoCorrect: constraint.autoCorrect || false,
      tags: constraint.tags || []
    };
  }

  initializeDefaultConstraints() {
    const defaultConstraints = [
      {
        id: 'no-console-log',
        type: 'anti-pattern',
        severity: 'error',
        matcher: 'console\\.log',
        message: 'Use Logger.log() instead of console.log',
        correctionAction: 'block',
        description: 'Enforce structured logging over console.log'
      },
      {
        id: 'trajectory-alignment',
        type: 'semantic',
        severity: 'warning',
        threshold: 5,
        message: 'Action misaligned with user intent',
        correctionAction: 'suggest',
        description: 'Ensure actions align with user goals'
      },
      {
        id: 'excessive-exploration',
        type: 'workflow',
        severity: 'warning',
        fileReadLimit: 10,
        message: 'Reading too many files for simple task',
        correctionAction: 'warn',
        description: 'Prevent excessive file exploration'
      },
      {
        id: 'unauthorized-commit',
        type: 'workflow',
        severity: 'critical',
        matcher: 'git commit|git push',
        message: 'Must ask permission before committing changes',
        correctionAction: 'block',
        description: 'Prevent unauthorized git operations'
      }
    ];

    for (const constraint of defaultConstraints) {
      const normalized = this.normalizeConstraint(constraint);
      this.constraints.set(constraint.id, normalized);
      
      if (!this.constraintsByType.has(constraint.type)) {
        this.constraintsByType.set(constraint.type, []);
      }
      this.constraintsByType.get(constraint.type).push(normalized);
    }

    logger.info('Initialized with default constraints');
  }

  /**
   * Detect constraint violations in an event
   * Target: <5ms for pattern checks, <50ms total including semantic analysis
   */
  async detectViolations(event, context = {}, semanticEngine = null) {
    const timer = new PerformanceTimer('constraint-detection');
    
    try {
      const violations = [];
      const sessionId = context.sessionId || 'unknown';

      // Fast pattern-based detection first
      const patternViolations = this.detectPatternViolations(event, context);
      violations.push(...patternViolations);

      // Workflow-based violations
      const workflowViolations = this.detectWorkflowViolations(event, context);
      violations.push(...workflowViolations);

      // Semantic violations (requires API call, so do last)
      if (semanticEngine) {
        const semanticConstraints = this.constraintsByType.get('semantic') || [];
        if (semanticConstraints.length > 0) {
          const semanticViolations = await semanticEngine.evaluateConstraints(
            event, 
            semanticConstraints, 
            context
          );
          violations.push(...semanticViolations);
        }
      }

      // Filter violations by cooldown and session limits
      const filteredViolations = this.filterViolations(violations, sessionId);

      // Log violations
      for (const violation of filteredViolations) {
        violationLogger.info('Constraint violation detected', {
          sessionId,
          violationType: violation.constraintId,
          severity: violation.severity,
          agent: event.agent,
          eventType: event.type,
          message: violation.message
        });
      }

      timer.end('completed', { 
        violationCount: filteredViolations.length,
        patternChecks: patternViolations.length,
        workflowChecks: workflowViolations.length
      });

      return filteredViolations;
    } catch (error) {
      timer.end('failed', { error: error.message });
      logger.error('Violation detection failed:', error);
      return [];
    }
  }

  detectPatternViolations(event, context) {
    const violations = [];
    const patternConstraints = this.constraintsByType.get('pattern') || [];
    const antiPatternConstraints = this.constraintsByType.get('anti-pattern') || [];
    
    const allPatternConstraints = [...patternConstraints, ...antiPatternConstraints];

    for (const constraint of allPatternConstraints) {
      if (!constraint.enabled) continue;

      try {
        const cacheKey = `${constraint.id}:${event.content?.substring(0, 100)}`;
        
        if (this.config.cacheEnabled && this.ruleCache.has(cacheKey)) {
          const cached = this.ruleCache.get(cacheKey);
          if (Date.now() - cached.timestamp < 30000) { // 30 second cache
            if (cached.violation) {
              violations.push(cached.violation);
            }
            continue;
          }
        }

        const pattern = new RegExp(constraint.matcher, 'gi');
        const matches = event.content?.match(pattern);

        if (matches) {
          const violation = {
            constraintId: constraint.id,
            type: constraint.type,
            severity: constraint.severity,
            message: constraint.message,
            matches: matches.slice(0, 3), // Limit for performance
            correctionAction: constraint.correctionAction,
            context: constraint.context,
            timestamp: Date.now(),
            eventId: event.uuid,
            autoCorrect: constraint.autoCorrect
          };

          violations.push(violation);

          // Cache the result
          if (this.config.cacheEnabled) {
            this.ruleCache.set(cacheKey, {
              violation,
              timestamp: Date.now()
            });
          }
        } else if (this.config.cacheEnabled) {
          // Cache non-violations too
          this.ruleCache.set(cacheKey, {
            violation: null,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        logger.warn(`Invalid pattern constraint ${constraint.id}:`, error);
      }
    }

    return violations;
  }

  detectWorkflowViolations(event, context) {
    const violations = [];
    const workflowConstraints = this.constraintsByType.get('workflow') || [];

    for (const constraint of workflowConstraints) {
      if (!constraint.enabled) continue;

      // File read limit check
      if (constraint.fileReadLimit && event.type === 'file_read') {
        const sessionReadCount = context.sessionStats?.fileReads || 0;
        if (sessionReadCount > constraint.fileReadLimit) {
          violations.push({
            constraintId: constraint.id,
            type: 'workflow',
            severity: constraint.severity,
            message: `Exceeded file read limit: ${sessionReadCount}/${constraint.fileReadLimit}`,
            correctionAction: constraint.correctionAction,
            timestamp: Date.now(),
            eventId: event.uuid,
            metadata: {
              currentCount: sessionReadCount,
              limit: constraint.fileReadLimit
            }
          });
        }
      }

      // Pattern-based workflow checks (e.g., git operations)
      if (constraint.matcher && event.content) {
        try {
          const pattern = new RegExp(constraint.matcher, 'gi');
          if (pattern.test(event.content)) {
            violations.push({
              constraintId: constraint.id,
              type: 'workflow',
              severity: constraint.severity,
              message: constraint.message,
              correctionAction: constraint.correctionAction,
              timestamp: Date.now(),
              eventId: event.uuid,
              requiresPermission: true
            });
          }
        } catch (error) {
          logger.warn(`Invalid workflow pattern ${constraint.id}:`, error);
        }
      }

      // Context-based checks
      if (constraint.context.length > 0 && context.activeConstraints) {
        const hasContext = constraint.context.some(ctx => 
          context.activeConstraints.includes(ctx)
        );
        
        if (!hasContext && event.type === 'implementation') {
          violations.push({
            constraintId: constraint.id,
            type: 'workflow',
            severity: 'info',
            message: `Missing expected context: ${constraint.context.join(', ')}`,
            correctionAction: 'suggest',
            timestamp: Date.now(),
            eventId: event.uuid
          });
        }
      }
    }

    return violations;
  }

  filterViolations(violations, sessionId) {
    const filtered = [];
    const sessionKey = `session:${sessionId}`;

    for (const violation of violations) {
      const constraint = this.constraints.get(violation.constraintId);
      if (!constraint) continue;

      // Check cooldown period
      if (constraint.cooldown > 0) {
        const historyKey = `${sessionKey}:${violation.constraintId}`;
        const lastViolation = this.violationHistory.get(historyKey);
        
        if (lastViolation && (Date.now() - lastViolation) < (constraint.cooldown * 1000)) {
          continue; // Skip due to cooldown
        }
        
        this.violationHistory.set(historyKey, Date.now());
      }

      // Check session limits
      if (constraint.maxViolationsPerSession < Infinity) {
        const sessionViolations = violations.filter(v => 
          v.constraintId === violation.constraintId
        ).length;
        
        if (sessionViolations > constraint.maxViolationsPerSession) {
          continue; // Skip due to session limit
        }
      }

      filtered.push(violation);
    }

    return filtered;
  }

  /**
   * Add or update a constraint rule
   */
  addConstraint(constraint) {
    try {
      const normalized = this.normalizeConstraint(constraint);
      this.constraints.set(constraint.id, normalized);

      // Update type index
      if (!this.constraintsByType.has(constraint.type)) {
        this.constraintsByType.set(constraint.type, []);
      }
      
      const typeList = this.constraintsByType.get(constraint.type);
      const existingIndex = typeList.findIndex(c => c.id === constraint.id);
      
      if (existingIndex >= 0) {
        typeList[existingIndex] = normalized;
      } else {
        typeList.push(normalized);
      }

      // Clear related cache entries
      this.clearCacheForConstraint(constraint.id);

      logger.info(`Added/updated constraint: ${constraint.id}`);
      return true;
    } catch (error) {
      logger.error('Failed to add constraint:', error);
      return false;
    }
  }

  /**
   * Remove a constraint rule
   */
  removeConstraint(constraintId) {
    if (this.constraints.has(constraintId)) {
      const constraint = this.constraints.get(constraintId);
      this.constraints.delete(constraintId);

      // Remove from type index
      const typeList = this.constraintsByType.get(constraint.type);
      if (typeList) {
        const index = typeList.findIndex(c => c.id === constraintId);
        if (index >= 0) {
          typeList.splice(index, 1);
        }
      }

      // Clear related cache
      this.clearCacheForConstraint(constraintId);

      logger.info(`Removed constraint: ${constraintId}`);
      return true;
    }
    return false;
  }

  clearCacheForConstraint(constraintId) {
    // Clear rule cache entries for this constraint
    for (const [key] of this.ruleCache) {
      if (key.startsWith(`${constraintId}:`)) {
        this.ruleCache.delete(key);
      }
    }

    // Clear violation history
    for (const [key] of this.violationHistory) {
      if (key.includes(`:${constraintId}`)) {
        this.violationHistory.delete(key);
      }
    }
  }

  /**
   * Get all active constraints
   */
  getConstraints(type = null, enabled = true) {
    if (type) {
      return (this.constraintsByType.get(type) || [])
        .filter(c => !enabled || c.enabled);
    }
    
    return Array.from(this.constraints.values())
      .filter(c => !enabled || c.enabled);
  }

  /**
   * Get constraint by ID
   */
  getConstraint(id) {
    return this.constraints.get(id);
  }

  /**
   * Get violation statistics
   */
  getViolationStats(timeWindow = 3600000) { // 1 hour default
    const cutoff = Date.now() - timeWindow;
    const stats = new Map();

    for (const [key, timestamp] of this.violationHistory) {
      if (timestamp > cutoff) {
        const [, constraintId] = key.split(':');
        stats.set(constraintId, (stats.get(constraintId) || 0) + 1);
      }
    }

    return Object.fromEntries(stats);
  }

  /**
   * Clear caches and reset state
   */
  reset() {
    this.ruleCache.clear();
    this.violationHistory.clear();
    logger.info('Constraint detector reset completed');
  }

  /**
   * Get system statistics
   */
  getStats() {
    return {
      constraintCount: this.constraints.size,
      enabledConstraints: Array.from(this.constraints.values()).filter(c => c.enabled).length,
      constraintsByType: Object.fromEntries(
        Array.from(this.constraintsByType.entries()).map(([type, list]) => [type, list.length])
      ),
      cacheSize: this.ruleCache.size,
      violationHistorySize: this.violationHistory.size,
      lastUpdate: new Date(this.lastUpdate).toISOString()
    };
  }
}