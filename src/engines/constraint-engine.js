import { logger } from '../utils/logger.js';
import { QdrantDatabase } from '../databases/qdrant-client.js';
import { DuckDBAnalytics } from '../databases/duckdb-client.js';

export class ConstraintEngine {
  constructor(config) {
    this.config = config;
    this.configManager = null;
    this.constraints = new Map();
    this.violations = [];
    this.qdrant = null;
    this.analytics = null;
  }

  async initialize() {
    try {
      // Import ConfigManager if not provided in constructor
      if (!this.configManager) {
        const { ConfigManager } = await import('../utils/config-manager.js');
        this.configManager = new ConfigManager();
      }
      
      // Load constraints from YAML configuration
      await this.loadConstraintsFromConfig();
      
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

      logger.info('Constraint Engine initialized with', this.constraints.size, 'constraints');
    } catch (error) {
      logger.error('Failed to initialize Constraint Engine:', error);
      throw error;
    }
  }

  async loadConstraintsFromConfig() {
    // Load constraints from YAML configuration via ConfigManager
    const constraints = this.configManager.getConstraints();
    
    logger.info(`Loading ${constraints.length} constraints from configuration`);
    
    for (const constraint of constraints) {
      // Validate constraint structure
      if (!constraint.id || !constraint.pattern || !constraint.message) {
        logger.warn('Invalid constraint definition:', constraint);
        continue;
      }
      
      // Set defaults for missing properties
      constraint.severity = constraint.severity || 'warning';
      constraint.enabled = constraint.enabled !== false; // Default to true
      constraint.suggestion = constraint.suggestion || '';
      
      // Store in constraints map
      this.constraints.set(constraint.id, constraint);
      
      logger.debug(`Loaded constraint: ${constraint.id} (${constraint.severity}) - ${constraint.message}`);
    }
    
    const enabledCount = Array.from(this.constraints.values()).filter(c => c.enabled).length;
    logger.info(`Constraint loading complete: ${this.constraints.size} total, ${enabledCount} enabled`);
  }

  async reloadConfiguration() {
    try {
      logger.info('Reloading constraint configuration');
      this.constraints.clear();
      await this.loadConstraintsFromConfig();
      logger.info('Constraint configuration reloaded successfully');
    } catch (error) {
      logger.error('Failed to reload constraint configuration:', error);
      throw error;
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