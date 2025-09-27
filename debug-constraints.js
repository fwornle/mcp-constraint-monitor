#!/usr/bin/env node

import { ConfigManager } from './src/utils/config-manager.js';
import { ConstraintEngine } from './src/engines/constraint-engine.js';

console.log('🔍 Testing constraint detection system...\n');

// Test ConfigManager
console.log('1. Testing ConfigManager...');
const configManager = new ConfigManager();
const constraints = configManager.getConstraints();

console.log(`   - Loaded ${constraints.length} constraints`);
console.log('   - Constraints:', constraints.map(c => ({
  id: c.id,
  pattern: c.pattern,
  enabled: c.enabled,
  severity: c.severity
})));

// Find console.log constraint
const consoleLogConstraint = constraints.find(c => c.id === 'no-console-log');
console.log('\n2. Console.log constraint:', consoleLogConstraint);

// Test regex pattern directly
if (consoleLogConstraint) {
  console.log('\n3. Testing regex pattern directly...');
  const pattern = new RegExp(consoleLogConstraint.pattern, 'g');
  const testCode = 'console.log("Hello World");';
  
  console.log(`   - Pattern: ${consoleLogConstraint.pattern}`);
  console.log(`   - Test code: ${testCode}`);
  console.log(`   - Regex object: ${pattern}`);
  console.log(`   - Match result: ${pattern.test(testCode)}`);
  
  // Reset regex and try again
  pattern.lastIndex = 0;
  const matches = testCode.match(pattern);
  console.log(`   - Match array: ${JSON.stringify(matches)}`);
}

// Test ConstraintEngine
console.log('\n4. Testing ConstraintEngine...');
const config = configManager;
const engine = new ConstraintEngine(config);

try {
  await engine.initialize();
  console.log('   - Engine initialized successfully');
  
  const testResult = await engine.checkConstraints({
    content: 'console.log("Hello World");',
    type: 'code',
    filePath: 'test.js'
  });
  console.log('   - Test result:', JSON.stringify(testResult, null, 2));
} catch (error) {
  console.error('   - Engine error:', error.message);
}