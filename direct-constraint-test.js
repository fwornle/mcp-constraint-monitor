#!/usr/bin/env node

/**
 * Direct Constraint System Test
 *
 * This test directly calls the hook system to verify constraint violation detection.
 * It simulates exactly how Claude Code would call the hooks with violating content.
 */

import { prePromptHook, preToolHook } from './src/hooks/real-time-constraint-hook.js';

// Test cases designed to trigger all 18 constraints
const testCases = [
  // WARNING LEVEL (should detect but not block)
  {
    id: 'no-console-log',
    type: 'prompt',
    content: 'console.log("debug message")',
    expectViolation: true,
    expectBlocked: false
  },
  {
    id: 'no-var-declarations',
    type: 'tool',
    tool: 'Write',
    content: 'var userName = "test";\nvar userAge = 25;',
    expectViolation: true,
    expectBlocked: false
  },

  // ERROR LEVEL (should detect and block)
  {
    id: 'proper-error-handling',
    type: 'tool',
    tool: 'Write',
    content: 'try {\n  riskyOperation();\n} catch (error) {\n}',
    expectViolation: true,
    expectBlocked: true
  },
  {
    id: 'debug-not-speculate',
    type: 'prompt',
    content: 'The error might be related to the database connection issue. It seems like the problem could be a timeout.',
    expectViolation: true,
    expectBlocked: true
  },

  // CRITICAL LEVEL (should detect and block)
  {
    id: 'no-hardcoded-secrets',
    type: 'tool',
    tool: 'Write',
    content: 'const api_key = "sk-1234567890abcdef";\nconst password = "super-secret-password-123";',
    expectViolation: true,
    expectBlocked: true
  },
  {
    id: 'no-eval-usage',
    type: 'tool',
    tool: 'Write',
    content: 'const result = eval("2 + 2");\nconst func = eval("() => console.log(\'hello\')");',
    expectViolation: true,
    expectBlocked: true
  },
];

async function runDirectTests() {
  console.log('🔬 DIRECT CONSTRAINT SYSTEM TEST');
  console.log('================================');
  console.log('Testing constraint detection through direct hook calls\n');

  let totalTests = 0;
  let violationsDetected = 0;
  let correctlyBlocked = 0;
  let incorrectlyBlocked = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`🧪 Testing: ${testCase.id}`);
    console.log(`   Content: "${testCase.content.substring(0, 50)}${testCase.content.length > 50 ? '...' : ''}"`);

    try {
      let result;

      if (testCase.type === 'prompt') {
        result = await prePromptHook(testCase.content, {
          timestamp: Date.now(),
          source: 'direct-test',
          workingDirectory: process.cwd(),
          sessionId: 'test-session'
        });
      } else if (testCase.type === 'tool') {
        result = await preToolHook({
          name: testCase.tool,
          parameters: {
            file_path: '/tmp/test-file.js',
            content: testCase.content
          }
        }, {
          timestamp: Date.now(),
          source: 'direct-test',
          workingDirectory: process.cwd(),
          sessionId: 'test-session'
        });
      }

      // If we get here, the hook didn't throw (no blocking)
      if (testCase.expectBlocked) {
        console.log(`   ❌ EXPECTED BLOCKED but got: ${JSON.stringify(result)}`);
        incorrectlyBlocked++;
      } else {
        console.log(`   ✅ CORRECTLY ALLOWED: ${JSON.stringify(result)}`);
        if (result.compliance && result.compliance < 10) {
          violationsDetected++;
          console.log(`   🎯 VIOLATION DETECTED (compliance: ${result.compliance})`);
        }
      }

    } catch (error) {
      // Hook threw an error (blocking)
      if (testCase.expectBlocked) {
        console.log(`   🛑 CORRECTLY BLOCKED: ${error.message.substring(0, 100)}...`);
        correctlyBlocked++;
        violationsDetected++;
      } else {
        console.log(`   ❌ INCORRECTLY BLOCKED: ${error.message.substring(0, 100)}...`);
        incorrectlyBlocked++;
      }
    }

    console.log('');
  }

  // Summary
  console.log('📊 DIRECT TEST RESULTS');
  console.log('======================');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Violations detected: ${violationsDetected}`);
  console.log(`Correctly blocked: ${correctlyBlocked}`);
  console.log(`Incorrectly blocked: ${incorrectlyBlocked}`);
  console.log(`Detection accuracy: ${((violationsDetected / totalTests) * 100).toFixed(1)}%`);
  console.log(`Blocking accuracy: ${(((correctlyBlocked) / (correctlyBlocked + incorrectlyBlocked || 1)) * 100).toFixed(1)}%`);

  if (violationsDetected === totalTests) {
    console.log('🎉 SUCCESS: All violations were detected!');
  } else {
    console.log('⚠️ ISSUE: Some violations were not detected.');
  }
}

runDirectTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});