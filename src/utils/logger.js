import winston from 'winston';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '../../logs');

// Create logs directory if it doesn't exist
import { mkdirSync } from 'fs';
try {
  mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Performance log format
const performanceFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, duration, operation, ...meta }) => {
    return `[${timestamp}] ${operation || 'OPERATION'}: ${message} (${duration}ms) ${JSON.stringify(meta)}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // General log file
    new winston.transports.File({
      filename: join(logsDir, 'constraint-monitor.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // Error log file
    new winston.transports.File({
      filename: join(logsDir, 'errors.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3
    })
  ]
});

// Performance logger
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: performanceFormat,
  transports: [
    new winston.transports.File({
      filename: join(logsDir, 'performance.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3
    })
  ]
});

// Violation logger  
export const violationLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message, ...meta }) => {
      return `[${timestamp}] VIOLATION: ${message} ${JSON.stringify(meta)}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: join(logsDir, 'violations.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5
    })
  ]
});

// Performance timing utility
export class PerformanceTimer {
  constructor(operation) {
    this.operation = operation;
    this.startTime = performance.now();
  }

  end(message = 'completed', metadata = {}) {
    const duration = Math.round(performance.now() - this.startTime);
    performanceLogger.info(message, {
      operation: this.operation,
      duration,
      ...metadata
    });
    return duration;
  }
}

// Convenience function for timing operations
export function timeOperation(operation, fn) {
  return async (...args) => {
    const timer = new PerformanceTimer(operation);
    try {
      const result = await fn(...args);
      timer.end('completed successfully');
      return result;
    } catch (error) {
      timer.end('failed with error', { error: error.message });
      throw error;
    }
  };
}

// Add unhandled exception handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default logger;