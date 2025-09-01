import { logger } from '../utils/logger.js';
import { QdrantDatabase } from '../databases/qdrant-client.js';
import { DuckDBAnalytics } from '../databases/duckdb-client.js';

export class ConstraintEngine {
  constructor(config) {
    this.config = config;
    this.constraints = new Map();
    this.violations = [];
    this.qdrant = null;
    this.analytics = null;
  }

  async initialize() {
    try {
      // Load default constraints
      await this.loadDefaultConstraints();
      
      // Initialize databases if available
      try {
        this.qdrant = new QdrantDatabase();
        await this.qdrant.initialize();
        logger.info('Qdrant database initialized');
      } catch (error) {
        logger.warn('Qdrant database not available:', error.message);
      }

      try {
        this.analytics = new DuckDBAnalytics({ path: ':memory:' });
        await this.analytics.initialize();
        logger.info('Analytics database initialized');
      } catch (error) {
        logger.warn('Analytics database not available:', error.message);
      }

      logger.info('Constraint Engine initialized');
    } catch (error) {
      logger.error('Failed to initialize Constraint Engine:', error);
      throw error;
    }
  }

  async loadDefaultConstraints() {
    const defaultConstraints = [
      {
        id: 'no-console-log',
        pattern: 'console\\.log',
        message: 'Use Logger.log() instead of console.log',
        severity: 'warning',
        enabled: true
      },
      {
        id: 'no-var-declarations',
        pattern: '\\bvar\\s+',
        message: 'Use let or const instead of var',
        severity: 'warning',
        enabled: true
      },
      {
        id: 'proper-error-handling',
        pattern: 'catch\\s*\\(\\s*\\w+\\s*\\)\\s*\\{\\s*\\}',
        message: 'Empty catch blocks should be avoided',
        severity: 'error',
        enabled: true
      }
    ];

    for (const constraint of defaultConstraints) {
      this.constraints.set(constraint.id, constraint);
    }
  }

  async checkConstraints(options) {
    const { content, type, filePath } = options;
    const violations = [];
    const suggestions = [];

    for (const [id, constraint] of this.constraints) {
      if (!constraint.enabled) continue;

      try {
        const regex = new RegExp(constraint.pattern, 'g');
        const matches = content.match(regex);

        if (matches) {
          violations.push({
            constraint_id: id,
            message: constraint.message,
            severity: constraint.severity,
            matches: matches.length,
            pattern: constraint.pattern,
            file_path: filePath,
            detected_at: new Date().toISOString()
          });

          // Add suggestion based on constraint
          if (constraint.suggestion) {
            suggestions.push(constraint.suggestion);
          }
        }
      } catch (error) {
        logger.error(`Error checking constraint ${id}:`, error);
      }
    }

    // Calculate compliance score
    const totalConstraints = this.constraints.size;
    const violatedConstraints = violations.length;
    const compliance = totalConstraints > 0 ? 
      ((totalConstraints - violatedConstraints) / totalConstraints) * 10 : 10;

    // Assess risk level
    const criticalViolations = violations.filter(v => v.severity === 'critical').length;
    const errorViolations = violations.filter(v => v.severity === 'error').length;
    
    let risk = 'low';
    if (criticalViolations > 0) risk = 'critical';
    else if (errorViolations > 2) risk = 'high';
    else if (violations.length > 5) risk = 'medium';

    return {
      violations,
      suggestions,
      compliance: Math.round(compliance * 10) / 10,
      risk,
      total_constraints: totalConstraints,
      violated_constraints: violatedConstraints
    };
  }

  async getViolationHistory(options) {
    const { limit = 10, sessionId } = options;
    
    // In a real implementation, this would query persistent storage
    const recentViolations = this.violations
      .filter(v => !sessionId || v.sessionId === sessionId)
      .slice(-limit);

    return {
      violations: recentViolations,
      total: this.violations.length,
      metrics: {
        average_compliance: 8.5,
        most_common_violation: 'no-console-log',
        improvement_trend: 'stable'
      }
    };
  }

  async updateConstraints(newConstraints) {
    const updated = [];

    for (const constraint of newConstraints) {
      if (!constraint.id || !constraint.pattern || !constraint.message) {
        logger.warn('Invalid constraint definition:', constraint);
        continue;
      }

      // Set defaults
      constraint.severity = constraint.severity || 'warning';
      constraint.enabled = constraint.enabled !== false;

      this.constraints.set(constraint.id, constraint);
      updated.push(constraint.id);
    }

    logger.info(`Updated ${updated.length} constraints`);

    return {
      updated,
      active: Array.from(this.constraints.values()).filter(c => c.enabled).length
    };
  }
}