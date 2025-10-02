#!/usr/bin/env node
/**
 * DEPRECATED: Real-time Constraint Monitoring Service
 *
 * This service is deprecated as of the Real Time Guardrails implementation.
 * Real-time constraint enforcement now happens through Claude Code pre-tool hooks.
 * See: /src/hooks/real-time-constraint-hook.js and Real Time Guardrails specification
 */

import { ConstraintEngine } from './engines/constraint-engine.js';
import { ConfigManager } from './utils/config-manager.js';
import { logger } from './utils/logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConstraintMonitorService {
  constructor(options = {}) {
    this.options = {
      watchPath: options.watchPath || join(__dirname, '../../..'),
      logLevel: options.logLevel || 'info',
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      ...options
    };

    this.constraintEngine = null;
    this.fileWatcher = null;
    this.isRunning = false;
    this.healthCheckTimer = null;

    this.setupSignalHandlers();
  }

  setupSignalHandlers() {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in monitoring service:', error);
      this.shutdown('UNCAUGHT_EXCEPTION');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in monitoring service:', { reason, promise });
    });
  }

  async start() {
    try {
      logger.info('Starting Constraint Monitoring Service', {
        watchPath: this.options.watchPath,
        logLevel: this.options.logLevel
      });

      // Initialize constraint engine
      const config = new ConfigManager();
      this.constraintEngine = new ConstraintEngine(config);
      await this.constraintEngine.initialize();

      logger.info('Constraint engine initialized successfully');

      // Start file watcher
      await this.constraintEngine.startFileWatcher({
        watchPath: this.options.watchPath,
        debounceMs: 2000, // 2 second debounce for file changes
        patterns: [
          '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx',
          '**/*.vue', '**/*.py', '**/*.java', '**/*.go',
          '**/*.rs', '**/*.c', '**/*.cpp', '**/*.h'
        ],
        ignored: [
          '**/node_modules/**', '**/.git/**', '**/dist/**',
          '**/build/**', '**/.next/**', '**/target/**',
          '**/.vscode/**', '**/.idea/**', '**/coverage/**'
        ]
      });

      this.isRunning = true;
      logger.info('File watcher started successfully');

      // Start health monitoring
      this.startHealthCheck();

      logger.info('Constraint Monitoring Service is now running', {
        watchPath: this.options.watchPath,
        status: 'operational'
      });

    } catch (error) {
      logger.error('Failed to start Constraint Monitoring Service:', error);
      throw error;
    }
  }

  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      try {
        const status = this.constraintEngine.getFileWatcherStatus();

        if (!status.isRunning) {
          logger.warn('File watcher is not running, attempting restart...');
          this.restartFileWatcher();
        } else {
          logger.debug('Health check passed', {
            watcherRunning: status.isRunning,
            queueSize: status.queueSize,
            watchedFiles: status.watchedFiles
          });
        }
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, this.options.healthCheckInterval);
  }

  async restartFileWatcher() {
    try {
      logger.info('Restarting file watcher...');

      await this.constraintEngine.stopFileWatcher();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      await this.constraintEngine.startFileWatcher({
        watchPath: this.options.watchPath
      });

      logger.info('File watcher restarted successfully');
    } catch (error) {
      logger.error('Failed to restart file watcher:', error);
    }
  }

  async shutdown(signal) {
    logger.info(`Received ${signal}, shutting down Constraint Monitoring Service...`);

    this.isRunning = false;

    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Stop file watcher
    if (this.constraintEngine) {
      try {
        await this.constraintEngine.stopFileWatcher();
        logger.info('File watcher stopped');
      } catch (error) {
        logger.error('Error stopping file watcher:', error);
      }
    }

    logger.info('Constraint Monitoring Service shut down complete');
    process.exit(0);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      fileWatcher: this.constraintEngine ? this.constraintEngine.getFileWatcherStatus() : null,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      options: this.options
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--watch-path':
        options.watchPath = args[++i];
        break;
      case '--log-level':
        options.logLevel = args[++i];
        break;
      case '--health-interval':
        options.healthCheckInterval = parseInt(args[++i]) * 1000;
        break;
      case '--help':
        console.log(`
Constraint Monitoring Service

Usage: node constraint-monitor-service.js [options]

Options:
  --watch-path <path>     Path to watch for file changes (default: ../../..)
  --log-level <level>     Log level: debug, info, warn, error (default: info)
  --health-interval <sec> Health check interval in seconds (default: 30)
  --help                  Show this help message

Examples:
  node constraint-monitor-service.js
  node constraint-monitor-service.js --watch-path /path/to/project --log-level debug
  node constraint-monitor-service.js --health-interval 60
        `);
        process.exit(0);
        break;
    }
  }

  // Start the service
  const service = new ConstraintMonitorService(options);

  service.start().catch(error => {
    logger.error('Failed to start monitoring service:', error);
    process.exit(1);
  });

  // Handle status requests
  process.on('SIGUSR1', () => {
    const status = service.getStatus();
    logger.info('Service Status:', status);
  });
}

export { ConstraintMonitorService };