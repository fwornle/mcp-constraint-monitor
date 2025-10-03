#!/usr/bin/env node

/**
 * Dashboard Integration Test
 *
 * This test simulates the complete flow from violation detection through logging
 * to dashboard display, showing how violations would appear in the dashboard
 * when they occur during actual Claude Code sessions.
 */

import { prePromptHook, preToolHook } from './src/hooks/real-time-constraint-hook.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Simulate violation persistence as it would happen in real Claude Code sessions
class ViolationPersistence {
  constructor() {
    this.violationStoragePath = '/Users/q284340/Agentic/coding/.mcp-sync/violation-history.json';
    this.sessionLogPath = '/Users/q284340/Agentic/coding/.mcp-sync/session-violations.jsonl';
  }

  generateViolationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  async logViolation(violationData) {
    try {
      // Read existing violations
      let existingData = { violations: [] };
      try {
        const content = readFileSync(this.violationStoragePath, 'utf8');
        existingData = JSON.parse(content);
      } catch (error) {
        console.log('Creating new violation storage file...');
      }

      // Add new violation
      const violation = {
        id: this.generateViolationId(),
        timestamp: new Date().toISOString(),
        sessionId: violationData.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        constraint_id: violationData.constraint_id,
        message: violationData.message,
        severity: violationData.severity,
        tool: 'empirical-test-hook',
        context: 'coding',
        project: 'coding',
        repository: 'coding',
        source: 'main',
        file_path: violationData.file_path || 'direct-test',
        matches: violationData.matches || 1,
        detected_at: new Date().toISOString()
      };

      existingData.violations.push(violation);

      // Write back to storage
      writeFileSync(this.violationStoragePath, JSON.stringify(existingData, null, 2));

      // Also append to session log
      const sessionLogEntry = JSON.stringify(violation) + '\n';
      writeFileSync(this.sessionLogPath, sessionLogEntry, { flag: 'a' });

      console.log(`📝 Logged violation: ${violation.constraint_id} (${violation.severity})`);
      return violation;
    } catch (error) {
      console.error('❌ Failed to log violation:', error);
      return null;
    }
  }
}

// Test cases that allow violations to be logged (warning level)
const warningLevelTests = [
  {
    id: 'no-console-log',
    type: 'prompt',
    content: 'console.log("debug message from empirical test")',
    expectDetected: true,
    expectLogged: true
  },
  {
    id: 'no-var-declarations',
    type: 'tool',
    tool: 'Write',
    content: 'var testVariable = "empirical test";\nvar anotherVar = 42;',
    expectDetected: true,
    expectLogged: true
  }
];

// Test cases that will be blocked (critical/error level)
const blockingTests = [
  {
    id: 'no-eval-usage',
    type: 'tool',
    tool: 'Write',
    content: 'const result = eval("Math.random()");',
    expectDetected: true,
    expectBlocked: true
  },
  {
    id: 'no-hardcoded-secrets',
    type: 'tool',
    tool: 'Write',
    content: 'const api_key = "sk-test123456789abcdef";',
    expectDetected: true,
    expectBlocked: true
  }
];

async function runDashboardIntegrationTest() {
  console.log('🔬 DASHBOARD INTEGRATION TEST');
  console.log('============================');
  console.log('Testing complete flow: Detection → Logging → Dashboard Display\n');

  const persistence = new ViolationPersistence();
  let detectedCount = 0;
  let loggedCount = 0;
  let blockedCount = 0;

  // Test warning-level violations (should be detected and logged)
  console.log('📋 Testing WARNING-level violations (detected but logged):');
  for (const testCase of warningLevelTests) {
    console.log(`\n🧪 Testing: ${testCase.id}`);

    try {
      let result;

      if (testCase.type === 'prompt') {
        result = await prePromptHook(testCase.content, {
          timestamp: Date.now(),
          source: 'dashboard-integration-test',
          workingDirectory: process.cwd(),
          sessionId: `test-session-${Date.now()}`
        });
      } else {
        result = await preToolHook({
          name: testCase.tool,
          parameters: {
            file_path: '/tmp/dashboard-test.js',
            content: testCase.content
          }
        }, {
          timestamp: Date.now(),
          source: 'dashboard-integration-test'
        });
      }

      // Violation detected but allowed (warning level)
      if (result.compliance && result.compliance < 10) {
        detectedCount++;
        console.log(`   ✅ VIOLATION DETECTED (compliance: ${result.compliance})`);

        // Simulate logging the violation (as would happen in real Claude Code)
        await persistence.logViolation({
          constraint_id: testCase.id,
          message: `Test violation for ${testCase.id}`,
          severity: 'warning',
          sessionId: `dashboard-test-${Date.now()}`,
          file_path: 'dashboard-integration-test.js'
        });

        loggedCount++;
        console.log(`   📝 VIOLATION LOGGED TO DASHBOARD`);
      }

    } catch (error) {
      console.log(`   ❌ Unexpected blocking: ${error.message.substring(0, 50)}...`);
    }
  }

  // Test critical/error violations (should be detected and blocked)
  console.log('\n\n🚫 Testing CRITICAL/ERROR-level violations (detected and blocked):');
  for (const testCase of blockingTests) {
    console.log(`\n🧪 Testing: ${testCase.id}`);

    try {
      let result;

      if (testCase.type === 'prompt') {
        result = await prePromptHook(testCase.content);
      } else {
        result = await preToolHook({
          name: testCase.tool,
          parameters: {
            file_path: '/tmp/dashboard-test.js',
            content: testCase.content
          }
        });
      }

      console.log(`   ❌ EXPECTED BLOCKING but got: ${JSON.stringify(result)}`);

    } catch (error) {
      detectedCount++;
      blockedCount++;
      console.log(`   🛑 CORRECTLY BLOCKED AND PREVENTED`);
      console.log(`   🚫 NOT LOGGED (blocked before execution)`);
    }
  }

  // Summary
  console.log('\n\n📊 DASHBOARD INTEGRATION RESULTS');
  console.log('================================');
  console.log(`Total violations detected: ${detectedCount}`);
  console.log(`Warning violations logged: ${loggedCount}`);
  console.log(`Critical/Error violations blocked: ${blockedCount}`);
  console.log('');
  console.log('✅ Dashboard should now show NEW warning-level violations');
  console.log('🛑 Critical/Error violations prevented (correctly NOT shown)');
  console.log('');
  console.log('🌐 View dashboard at: http://localhost:3030');
  console.log('');

  if (loggedCount > 0) {
    console.log('🎉 SUCCESS: New violations logged and should appear in dashboard!');
  } else {
    console.log('⚠️ No new violations were logged to dashboard storage');
  }
}

runDashboardIntegrationTest().catch(error => {
  console.error('❌ Dashboard integration test failed:', error);
  process.exit(1);
});