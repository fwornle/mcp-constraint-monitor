import { logger } from '../utils/logger.js';
import { QdrantDatabase } from '../databases/qdrant-client.js';
import { DuckDBAnalytics } from '../databases/duckdb-client.js';
import fs from 'fs';
import path from 'path';

export class ConstraintEngine {
  constructor(configManager) {
    this.configManager = configManager; // Use the provided ConfigManager
    this.constraints = new Map();
    this.violations = [];
    this.qdrant = null;
    this.analytics = null;
    this.fileWatcher = null;
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
        logger.info('Qdrant database initialized successfully');
      } catch (error) {
        logger.warn('Qdrant database not available:', error.message);
        this.qdrant = null;
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

    // Debug logging
    logger.info(`Checking constraints for ${filePath}`, {
      contentLength: content?.length,
      totalConstraints: this.constraints.size,
      constraintIds: Array.from(this.constraints.keys())
    });

    for (const [id, constraint] of this.constraints) {
      if (!constraint.enabled) {
        logger.debug(`Skipping disabled constraint: ${id}`);
        continue;
      }

      try {
        // Extract inline flags from pattern (e.g., (?i) for case-insensitive)
        let pattern = constraint.pattern;
        let extractedFlags = '';

        // Check for (?i) inline flag and extract it
        if (pattern.startsWith('(?i)')) {
          pattern = pattern.substring(4);
          extractedFlags += 'i';
        }

        // Build regex flags - always include 'g' for global matching, plus any constraint-specific or extracted flags
        const flags = 'g' + (constraint.flags || '') + extractedFlags;
        const regex = new RegExp(pattern, flags);
        const matches = content.match(regex);

        logger.debug(`Testing constraint ${id}`, {
          pattern: constraint.pattern,
          matches: matches ? matches.length : 0,
          firstMatch: matches ? matches[0] : null
        });

        if (matches) {
          const violation = {
            constraint_id: id,
            message: constraint.message,
            severity: constraint.severity,
            matches: matches.length,
            pattern: constraint.pattern,
            file_path: filePath,
            detected_at: new Date().toISOString()
          };

          violations.push(violation);

          logger.info(`Violation detected: ${id}`, {
            matches: matches.length,
            severity: constraint.severity
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

    logger.info(`Constraint check complete`, {
      violations: violations.length,
      compliance: Math.round(compliance * 10) / 10,
      risk
    });

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

  // NOTE: File watching approach has been deprecated in favor of pre-tool hook prevention
  // Real-time constraint enforcement now happens through Claude Code hook system
  // See: /src/hooks/real-time-constraint-hook.js and Real Time Guardrails specification

  async startFileWatcher(options = {}) {
    logger.warn('File watcher is deprecated. Real-time enforcement now uses Claude Code hooks.');
    logger.info('Constraint enforcement active through pre-tool and pre-prompt hooks.');
    return;
  }

  async stopFileWatcher() {
    logger.info('File watcher functionality deprecated - no action needed');
    return;
  }

  getFileWatcherStatus() {
    return {
      isRunning: false,
      deprecated: true,
      message: 'Real-time enforcement active through Claude Code hooks'
    };
  }
}

// NOTE: FileWatcher class removed as part of deprecating post-hoc file monitoring approach
// Real-time constraint enforcement now happens through Claude Code pre-tool hooks
// See Real Time Guardrails specification Task 8 - this is the correct architectural approach
