#!/usr/bin/env node

/**
 * Constraint Configuration Loader
 * Loads and parses constraint YAML files for the real-time enforcement system
 */

import { readFileSync } from 'fs';
import { parse } from 'yaml';

function loadConstraints(configPath) {
  try {
    const yamlContent = readFileSync(configPath, 'utf8');
    const config = parse(yamlContent);
    
    // Add default enforcement settings if not present
    if (!config.enforcement) {
      config.enforcement = {
        enabled: true,
        blocking_levels: ['critical', 'error'],
        warning_levels: ['warning'],
        info_levels: ['info'],
        fail_open: true // Continue if constraint server unavailable
      };
    }
    
    return config;
  } catch (error) {
    console.error(`Failed to load constraints from ${configPath}:`, error.message);
    process.exit(1);
  }
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node load-constraints.js <config-path>');
    process.exit(1);
  }
  
  const config = loadConstraints(configPath);
  console.error(JSON.stringify(config, null, 2));
}

export { loadConstraints };