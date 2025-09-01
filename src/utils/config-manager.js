import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
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
        groq: {
          apiKey: process.env.GROQ_API_KEY,
          model: 'llama-3.1-8b-instant'
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
}