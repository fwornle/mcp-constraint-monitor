import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { logger } from './logger.js';

export class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const defaultConfig = {
      constraints: {
        enabled: true,
        configFile: './constraints.yaml',
        autoUpdate: true
      },
      databases: {
        qdrant: {
          host: process.env.QDRANT_HOST || 'localhost',
          port: parseInt(process.env.QDRANT_PORT) || 6333,
          collection: 'constraint_violations'
        },
        analytics: {
          path: process.env.ANALYTICS_DB_PATH || ':memory:',
          enabled: true
        }
      },
      monitoring: {
        enabled: true,
        interval: 1000,
        maxViolations: 100
      },
      api: {
        grok: {
          apiKey: process.env.GROK_API_KEY,
          model: 'grok-2-1212'
        }
      }
    };

    // Try to load project-specific config
    const configPaths = [
      './mcp-constraint-monitor.json',
      './constraint-monitor.json',
      './.constraint-monitor.json'
    ];

    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const projectConfig = JSON.parse(readFileSync(configPath, 'utf8'));
          logger.info(`Loaded config from ${configPath}`);
          return this.mergeConfig(defaultConfig, projectConfig);
        } catch (error) {
          logger.warn(`Failed to load config from ${configPath}:`, error.message);
        }
      }
    }

    // Try to load from environment
    if (process.env.CONSTRAINT_MONITOR_CONFIG) {
      try {
        const envConfig = JSON.parse(process.env.CONSTRAINT_MONITOR_CONFIG);
        return this.mergeConfig(defaultConfig, envConfig);
      } catch (error) {
        logger.warn('Failed to parse CONSTRAINT_MONITOR_CONFIG:', error.message);
      }
    }

    logger.info('Using default configuration');
    return defaultConfig;
  }

  mergeConfig(defaultConfig, userConfig) {
    // Deep merge configuration objects
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(userConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  get(path, defaultValue) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  }

  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  getConstraints() {
    // Look for constraints.yaml relative to this module's directory
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const constraintsPath = join(__dirname, '../../constraints.yaml');
    
    if (!existsSync(constraintsPath)) {
      logger.warn(`constraints.yaml not found at ${constraintsPath}, using default constraints`);
      return this.getDefaultConstraints();
    }
    
    try {
      const content = readFileSync(constraintsPath, 'utf8');
      const data = parse(content);
      return data.constraints || [];
    } catch (error) {
      logger.error('Failed to parse constraints.yaml', { error: error.message });
      return this.getDefaultConstraints();
    }
  }

  getDefaultConstraints() {
    return [
      {
        id: 'no-console-log',
        pattern: 'console\\.log',
        message: 'Use Logger.log() instead of console.log for better log management',
        severity: 'warning',
        enabled: true,
        suggestion: 'Replace with: Logger.log(\'info\', \'category\', message)'
      },
      {
        id: 'no-var-declarations',
        pattern: '\\bvar\\s+',
        message: 'Use \'let\' or \'const\' instead of \'var\'',
        severity: 'warning',
        enabled: true,
        suggestion: 'Use \'let\' for mutable variables, \'const\' for immutable'
      },
      {
        id: 'proper-error-handling',
        pattern: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
        message: 'Empty catch blocks should be avoided',
        severity: 'error',
        enabled: true,
        suggestion: 'Add proper error handling or at minimum log the error'
      },
      {
        id: 'no-hardcoded-secrets',
        pattern: '(api[_-]?key|password|secret|token)\\s*[=:]\\s*[\'"][^\'\"]{8,}[\'"]',
        message: 'Potential hardcoded secret detected',
        severity: 'critical',
        enabled: true,
        suggestion: 'Use environment variables or secure key management'
      },
      {
        id: 'no-eval-usage',
        pattern: '\\beval\\s*\\(',
        message: 'eval() usage detected - security risk',
        severity: 'critical',
        enabled: true,
        suggestion: 'Avoid eval() - use safer alternatives for dynamic code execution'
      },
      {
        id: 'proper-function-naming',
        pattern: 'function\\s+[a-z]',
        message: 'Function names should start with a verb (camelCase)',
        severity: 'info',
        enabled: true,
        suggestion: 'Use descriptive verb-based names: getUserData(), processResults()'
      }
    ];
  }
}