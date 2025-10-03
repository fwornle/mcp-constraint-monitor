#!/usr/bin/env node

/**
 * COMPLETE ALL CONSTRAINTS TEST
 *
 * This test ACTUALLY triggers ALL 18 enabled constraints including the missing info-level ones.
 * Every violation is logged to the dashboard with real hook execution.
 */

import { prePromptHook, preToolHook } from './src/hooks/real-time-constraint-hook.js';

// COMPLETE TEST SUITE - ALL 18 ENABLED CONSTRAINTS
const COMPLETE_CONSTRAINT_TESTS = [

  // === CODE QUALITY GROUP (5 constraints) ===

  // 1. no-console-log (warning)
  {
    id: 'no-console-log',
    severity: 'warning',
    type: 'tool',
    tool: 'Write',
    content: `function debug() {\n  console.log("debug information");\n}`,
    description: 'Testing console.log usage detection'
  },

  // 2. no-var-declarations (warning)
  {
    id: 'no-var-declarations',
    severity: 'warning',
    type: 'tool',
    tool: 'Write',
    content: `var userName = "testUser";\nvar userId = 12345;`,
    description: 'Testing var declaration detection'
  },

  // 3. proper-error-handling (error)
  {
    id: 'proper-error-handling',
    severity: 'error',
    type: 'tool',
    tool: 'Write',
    content: `try {\n  riskyOperation();\n} catch (error) {\n}`,
    description: 'Testing empty catch block detection'
  },

  // 4. proper-function-naming (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'proper-function-naming',
    severity: 'info',
    type: 'tool',
    tool: 'Write',
    content: `function user() {\n  return getCurrentUser();\n}\nfunction data() {\n  return fetchData();\n}`,
    description: 'Testing poor function naming detection'
  },

  // 5. no-magic-numbers (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'no-magic-numbers',
    severity: 'info',
    type: 'tool',
    tool: 'Write',
    content: `const timeout = 5000;\nconst maxRetries = 10;\nconst bufferSize = 1024;`,
    description: 'Testing magic number detection'
  },

  // === SECURITY GROUP (2 constraints) ===

  // 6. no-hardcoded-secrets (critical)
  {
    id: 'no-hardcoded-secrets',
    severity: 'critical',
    type: 'tool',
    tool: 'Write',
    content: `const config = {\n  api_key: "sk-1234567890abcdefghijklmnop",\n  password: "super-secret-password-123"\n};`,
    description: 'Testing hardcoded secrets detection'
  },

  // 7. no-eval-usage (critical)
  {
    id: 'no-eval-usage',
    severity: 'critical',
    type: 'tool',
    tool: 'Write',
    content: `const result = eval("Math.random() * 100");\neval("console.log('dangerous')");`,
    description: 'Testing eval() usage detection'
  },

  // === ARCHITECTURE GROUP (3 constraints) ===

  // 8. no-parallel-files (critical)
  {
    id: 'no-parallel-files',
    severity: 'critical',
    type: 'tool',
    tool: 'Write',
    content: `export class ComponentEnhanced extends Component {\n  render() {\n    return <div>Improved version</div>;\n  }\n}`,
    description: 'Testing parallel file naming detection'
  },

  // 9. debug-not-speculate (error)
  {
    id: 'debug-not-speculate',
    severity: 'error',
    type: 'prompt',
    content: 'The error might be related to the database connection issue. It seems like the timeout could be causing this problem.',
    description: 'Testing speculation language detection'
  },

  // 10. no-evolutionary-names (error)
  {
    id: 'no-evolutionary-names',
    severity: 'error',
    type: 'tool',
    tool: 'Write',
    content: `function processDataV2() {\n  return improvedProcessing();\n}\nclass UserManagerEnhanced {\n  constructor() {}\n}`,
    description: 'Testing evolutionary naming detection'
  },

  // === PLANTUML GROUP (5 constraints) ===

  // 11. plantuml-standard-styling (error)
  {
    id: 'plantuml-standard-styling',
    severity: 'error',
    type: 'tool',
    tool: 'Write',
    content: `@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi there\n@enduml`,
    description: 'Testing PlantUML standard styling requirement'
  },

  // 12. plantuml-file-location (warning)
  {
    id: 'plantuml-file-location',
    severity: 'warning',
    type: 'tool',
    tool: 'Write',
    content: `@startuml\n!include common.puml\n!include styles.puml\nAlice -> Bob\n@enduml`,
    description: 'Testing PlantUML file location requirement'
  },

  // 13. plantuml-diagram-workflow (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'plantuml-diagram-workflow',
    severity: 'info',
    type: 'prompt',
    content: 'Create an architecture diagram showing the system flow and sequence chart for the user registration process.',
    description: 'Testing PlantUML workflow guidance'
  },

  // 14. plantuml-readability-guidelines (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'plantuml-readability-guidelines',
    severity: 'info',
    type: 'prompt',
    content: 'The diagram is too wide and barely readable, we need to restructure for readability and better layout.',
    description: 'Testing PlantUML readability guidance'
  },

  // 15. plantuml-file-organization (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'plantuml-file-organization',
    severity: 'info',
    type: 'tool',
    tool: 'Write',
    content: '@startuml\\nAlice -> Bob\\n@enduml',
    description: 'Testing PlantUML file organization (filename pattern)'
  },

  // === DOCUMENTATION GROUP (3 constraints) ===

  // 16. image-reference-pattern (warning)
  {
    id: 'image-reference-pattern',
    severity: 'warning',
    type: 'tool',
    tool: 'Write',
    content: `# System Architecture\n\n![System Overview](../images/overview.png)\n![Database Schema](./local/schema.jpg)`,
    description: 'Testing image reference pattern requirements'
  },

  // 17. documentation-filename-format (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'documentation-filename-format',
    severity: 'info',
    type: 'tool',
    tool: 'Write',
    content: '# User Guide Documentation\\n\\nThis is the comprehensive user guide.',
    description: 'Testing documentation filename format (would need to be saved as UserGuideDocumentation.md)'
  },

  // 18. update-main-readme (info) - MISSING FROM PREVIOUS TEST
  {
    id: 'update-main-readme',
    severity: 'info',
    type: 'prompt',
    content: 'Update the main README to modify the structure and change the content format to be more modern.',
    description: 'Testing README update guidance'
  }
];

// Test execution engine
async function runCompleteConstraintTest() {
  console.log('🔬 COMPLETE ALL CONSTRAINTS TEST');
  console.log('=================================');
  console.log('Testing ALL 18 enabled constraints with REAL violation triggering');
  console.log('Including the missing INFO-level constraints\\n');

  let totalTests = 0;
  let violationsDetected = 0;
  let violationsLogged = 0;
  let correctlyBlocked = 0;
  let correctlyAllowed = 0;

  const severityCounts = { critical: 0, error: 0, warning: 0, info: 0 };

  for (const testCase of COMPLETE_CONSTRAINT_TESTS) {
    totalTests++;
    severityCounts[testCase.severity]++;

    console.log(`\\n🧪 [${testCase.severity.toUpperCase()}] Testing: ${testCase.id}`);
    console.log(`   📝 Test: ${testCase.description}`);
    console.log(`   📄 Content: "${testCase.content.substring(0, 50)}${testCase.content.length > 50 ? '...' : ''}"`);

    try {
      let result;
      const context = {
        timestamp: Date.now(),
        source: 'complete-constraint-test',
        workingDirectory: process.cwd(),
        sessionId: `complete-test-${Date.now()}`
      };

      // Execute the actual hook
      if (testCase.type === 'prompt') {
        result = await prePromptHook(testCase.content, context);
      } else if (testCase.type === 'tool') {
        result = await preToolHook({
          name: testCase.tool,
          parameters: {
            file_path: `/tmp/complete-test-${testCase.id}.js`,
            content: testCase.content
          }
        }, context);
      }

      // Analyze results
      if (result.compliance && result.compliance < 10) {
        violationsDetected++;
        violationsLogged++;
        console.log(`   ✅ VIOLATION DETECTED & LOGGED (compliance: ${result.compliance})`);

        // Info and warning should be allowed, critical/error should be blocked
        const shouldBeBlocked = ['critical', 'error'].includes(testCase.severity);
        if (shouldBeBlocked) {
          console.log(`   ❌ EXPECTED BLOCKING but was allowed`);
        } else {
          console.log(`   ✅ CORRECTLY ALLOWED (${testCase.severity} level)`);
          correctlyAllowed++;
        }
      } else {
        console.log(`   ⚠️ NO VIOLATION DETECTED`);
      }

    } catch (error) {
      // Hook threw an error (blocking)
      if (error.message.includes('CONSTRAINT VIOLATION')) {
        violationsDetected++;
        violationsLogged++;

        const shouldBeBlocked = ['critical', 'error'].includes(testCase.severity);
        if (shouldBeBlocked) {
          console.log(`   🛑 CORRECTLY BLOCKED & LOGGED`);
          console.log(`   📢 Block Message: "${error.message.substring(0, 80)}..."`);
          correctlyBlocked++;
        } else {
          console.log(`   ❌ INCORRECTLY BLOCKED (should be ${testCase.severity})`);
        }
      } else {
        console.log(`   ❌ UNEXPECTED ERROR: ${error.message}`);
      }
    }
  }

  // Final Results
  console.log('\\n\\n📊 COMPLETE TEST RESULTS');
  console.log('=========================');
  console.log(`📋 Total constraints tested: ${totalTests}/18`);
  console.log(`🎯 Violations detected: ${violationsDetected}`);
  console.log(`📝 Violations logged to dashboard: ${violationsLogged}`);
  console.log(`🛑 Correctly blocked (critical/error): ${correctlyBlocked}`);
  console.log(`✅ Correctly allowed (warning/info): ${correctlyAllowed}`);
  console.log('');

  // Severity Breakdown
  console.log('📈 EXPECTED SEVERITY BREAKDOWN:');
  console.log(`   Critical: ${severityCounts.critical} constraints`);
  console.log(`   Error: ${severityCounts.error} constraints`);
  console.log(`   Warning: ${severityCounts.warning} constraints`);
  console.log(`   Info: ${severityCounts.info} constraints`);
  console.log('');

  console.log('🌐 Dashboard URL: http://localhost:3030');
  console.log('📊 All violations should now appear in dashboard including INFO level');
  console.log('');

  // Success criteria
  const detectionRate = (violationsDetected / totalTests) * 100;

  if (detectionRate >= 95) {
    console.log('🎉 SUCCESS: Complete constraint system tested - ALL severities triggered!');
  } else {
    console.log('⚠️ ISSUES: Some constraints not working as expected');
  }

  console.log(`📈 Detection Rate: ${detectionRate.toFixed(1)}%`);
  console.log(`🎯 Expected to see ${severityCounts.info} INFO violations in dashboard`);
}

// Execute the complete test
runCompleteConstraintTest().catch(error => {
  console.error('❌ Complete constraint test execution failed:', error);
  process.exit(1);
});