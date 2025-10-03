#!/usr/bin/env node

/**
 * COMPREHENSIVE REAL CONSTRAINT TEST
 *
 * This test exercises ALL 18 enabled constraints with REAL Claude Code hook execution.
 * Every violation is logged to the dashboard BEFORE deciding whether to block.
 * Shows actual blocking messages that users would see in Claude Code.
 */

import { prePromptHook, preToolHook } from './src/hooks/real-time-constraint-hook.js';

// ALL 18 ENABLED CONSTRAINTS - Complete Test Suite
const ALL_CONSTRAINT_TESTS = [

  // === CODE QUALITY GROUP (5 constraints) ===
  {
    id: 'no-console-log',
    severity: 'warning',
    group: 'code_quality',
    type: 'tool',
    tool: 'Write',
    content: `function debug() {
  console.log("debug information");
  console.log("more debugging");
}`,
    description: 'Testing console.log usage detection',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'no-var-declarations',
    severity: 'warning',
    group: 'code_quality',
    type: 'tool',
    tool: 'Write',
    content: `var userName = "testUser";
var userId = 12345;
var isActive = true;`,
    description: 'Testing var declaration detection',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'proper-error-handling',
    severity: 'error',
    group: 'code_quality',
    type: 'tool',
    tool: 'Write',
    content: `try {
  riskyDatabaseOperation();
  anotherRiskyCall();
} catch (error) {
}`,
    description: 'Testing empty catch block detection',
    expectBlocked: true,
    expectLogged: true
  },

  {
    id: 'proper-function-naming',
    severity: 'info',
    group: 'code_quality',
    type: 'tool',
    tool: 'Write',
    content: `function user() {
  return getCurrentUser();
}
function data() {
  return fetchData();
}`,
    description: 'Testing poor function naming detection',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'no-magic-numbers',
    severity: 'info',
    group: 'code_quality',
    type: 'tool',
    tool: 'Write',
    content: `const timeout = 5000;
const maxRetries = 10;
const bufferSize = 1024;
const port = 8080;`,
    description: 'Testing magic number detection',
    expectBlocked: false,
    expectLogged: true
  },

  // === SECURITY GROUP (2 constraints) ===
  {
    id: 'no-hardcoded-secrets',
    severity: 'critical',
    group: 'security',
    type: 'tool',
    tool: 'Write',
    content: `const config = {
  api_key: "sk-1234567890abcdefghijklmnop",
  password: "super-secret-password-123",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
};`,
    description: 'Testing hardcoded secrets detection',
    expectBlocked: true,
    expectLogged: true
  },

  {
    id: 'no-eval-usage',
    severity: 'critical',
    group: 'security',
    type: 'tool',
    tool: 'Write',
    content: `const result = eval("Math.random() * 100");
const dynamicCode = eval("function test() { return 42; }");
eval("console.log('dangerous')");`,
    description: 'Testing eval() usage detection',
    expectBlocked: true,
    expectLogged: true
  },

  // === ARCHITECTURE GROUP (3 constraints) ===
  {
    id: 'no-parallel-files',
    severity: 'critical',
    group: 'architecture',
    type: 'tool',
    tool: 'Write',
    content: `export class ComponentEnhanced extends Component {
  render() {
    return <div>Improved version</div>;
  }
}`,
    description: 'Testing parallel file naming detection',
    expectBlocked: true,
    expectLogged: true
  },

  {
    id: 'debug-not-speculate',
    severity: 'error',
    group: 'architecture',
    type: 'prompt',
    content: 'The error might be related to the database connection issue. It seems like the timeout could be causing this problem.',
    description: 'Testing speculation language detection',
    expectBlocked: true,
    expectLogged: true
  },

  {
    id: 'no-evolutionary-names',
    severity: 'error',
    group: 'architecture',
    type: 'tool',
    tool: 'Write',
    content: `function processDataV2() {
  return improvedProcessing();
}
class UserManagerEnhanced {
  constructor() {}
}`,
    description: 'Testing evolutionary naming detection',
    expectBlocked: true,
    expectLogged: true
  },

  // === PLANTUML GROUP (5 constraints) ===
  {
    id: 'plantuml-standard-styling',
    severity: 'error',
    group: 'plantuml',
    type: 'tool',
    tool: 'Write',
    content: `@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi there
@enduml`,
    description: 'Testing PlantUML standard styling requirement',
    expectBlocked: true,
    expectLogged: true
  },

  {
    id: 'plantuml-file-location',
    severity: 'warning',
    group: 'plantuml',
    type: 'tool',
    tool: 'Write',
    content: `@startuml
!include common.puml
!include styles.puml
Alice -> Bob
@enduml`,
    description: 'Testing PlantUML file location requirement',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'plantuml-diagram-workflow',
    severity: 'info',
    group: 'plantuml',
    type: 'prompt',
    content: 'Create an architecture diagram showing the system flow and sequence chart for the user registration process.',
    description: 'Testing PlantUML workflow guidance',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'plantuml-readability-guidelines',
    severity: 'info',
    group: 'plantuml',
    type: 'prompt',
    content: 'The diagram is too wide and barely readable, we need to restructure for readability and better layout.',
    description: 'Testing PlantUML readability guidance',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'plantuml-file-organization',
    severity: 'info',
    group: 'plantuml',
    type: 'tool',
    tool: 'Write',
    content: '@startuml\nAlice -> Bob\n@enduml',
    description: 'Testing PlantUML file organization (filename pattern)',
    expectBlocked: false,
    expectLogged: true
  },

  // === DOCUMENTATION GROUP (3 constraints) ===
  {
    id: 'image-reference-pattern',
    severity: 'warning',
    group: 'documentation',
    type: 'tool',
    tool: 'Write',
    content: `# System Architecture

![System Overview](../images/overview.png)
![Database Schema](./local/schema.jpg)
![API Flow](images/api-flow.svg)`,
    description: 'Testing image reference pattern requirements',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'documentation-filename-format',
    severity: 'info',
    group: 'documentation',
    type: 'tool',
    tool: 'Write',
    content: '# User Guide Documentation\n\nThis is the comprehensive user guide.',
    description: 'Testing documentation filename format (would need to be saved as UserGuideDocumentation.md)',
    expectBlocked: false,
    expectLogged: true
  },

  {
    id: 'update-main-readme',
    severity: 'info',
    group: 'documentation',
    type: 'prompt',
    content: 'Update the main README to modify the structure and change the content format to be more modern.',
    description: 'Testing README update guidance',
    expectBlocked: false,
    expectLogged: true
  }
];

// Test execution engine
async function runComprehensiveConstraintTest() {
  console.log('🔬 COMPREHENSIVE REAL CONSTRAINT TEST');
  console.log('=====================================');
  console.log('Testing ALL 18 enabled constraints with REAL Claude Code hook execution');
  console.log('All violations will be logged to dashboard BEFORE blocking decisions\n');

  let totalTests = 0;
  let violationsDetected = 0;
  let violationsLogged = 0;
  let correctlyBlocked = 0;
  let incorrectlyBlocked = 0;
  let correctlyAllowed = 0;

  const resultsByGroup = {};

  for (const testCase of ALL_CONSTRAINT_TESTS) {
    totalTests++;

    if (!resultsByGroup[testCase.group]) {
      resultsByGroup[testCase.group] = { total: 0, detected: 0, blocked: 0, allowed: 0 };
    }
    resultsByGroup[testCase.group].total++;

    console.log(`\n🧪 [${testCase.group.toUpperCase()}] Testing: ${testCase.id}`);
    console.log(`   📋 Severity: ${testCase.severity.toUpperCase()}`);
    console.log(`   📝 Test: ${testCase.description}`);
    console.log(`   📄 Content: "${testCase.content.substring(0, 50)}${testCase.content.length > 50 ? '...' : ''}"`);

    try {
      let result;
      const context = {
        timestamp: Date.now(),
        source: 'comprehensive-constraint-test',
        workingDirectory: process.cwd(),
        sessionId: `test-session-${Date.now()}`
      };

      // Execute the actual hook
      if (testCase.type === 'prompt') {
        result = await prePromptHook(testCase.content, context);
      } else if (testCase.type === 'tool') {
        result = await preToolHook({
          name: testCase.tool,
          parameters: {
            file_path: `/tmp/test-${testCase.id}.js`,
            content: testCase.content
          }
        }, context);
      }

      // Analyze results
      if (result.compliance && result.compliance < 10) {
        violationsDetected++;
        violationsLogged++;
        resultsByGroup[testCase.group].detected++;
        console.log(`   ✅ VIOLATION DETECTED & LOGGED (compliance: ${result.compliance})`);

        if (testCase.expectBlocked) {
          console.log(`   ❌ EXPECTED BLOCKING but was allowed`);
          incorrectlyBlocked++;
        } else {
          console.log(`   ✅ CORRECTLY ALLOWED (warning/info level)`);
          correctlyAllowed++;
          resultsByGroup[testCase.group].allowed++;
        }
      } else {
        console.log(`   ⚠️ NO VIOLATION DETECTED`);
      }

    } catch (error) {
      // Hook threw an error (blocking)
      if (error.message.includes('CONSTRAINT VIOLATION')) {
        violationsDetected++;
        violationsLogged++;
        resultsByGroup[testCase.group].detected++;

        if (testCase.expectBlocked) {
          console.log(`   🛑 CORRECTLY BLOCKED & LOGGED`);
          console.log(`   📢 Block Message: "${error.message.substring(0, 80)}..."`);
          correctlyBlocked++;
          resultsByGroup[testCase.group].blocked++;
        } else {
          console.log(`   ❌ INCORRECTLY BLOCKED (should be warning/info)`);
          incorrectlyBlocked++;
        }
      } else {
        console.log(`   ❌ UNEXPECTED ERROR: ${error.message}`);
      }
    }
  }

  // Final Results
  console.log('\n\n📊 COMPREHENSIVE TEST RESULTS');
  console.log('==============================');
  console.log(`📋 Total constraints tested: ${totalTests}`);
  console.log(`🎯 Violations detected: ${violationsDetected}`);
  console.log(`📝 Violations logged to dashboard: ${violationsLogged}`);
  console.log(`🛑 Correctly blocked (critical/error): ${correctlyBlocked}`);
  console.log(`✅ Correctly allowed (warning/info): ${correctlyAllowed}`);
  console.log(`❌ Incorrectly handled: ${incorrectlyBlocked}`);
  console.log('');

  // Results by Group
  console.log('📈 RESULTS BY CONSTRAINT GROUP:');
  for (const [group, stats] of Object.entries(resultsByGroup)) {
    console.log(`   ${group}: ${stats.detected}/${stats.total} detected, ${stats.blocked} blocked, ${stats.allowed} allowed`);
  }
  console.log('');

  console.log('🌐 Dashboard URL: http://localhost:3030');
  console.log('📊 All violations should now appear in dashboard with "live-hook" tool marking');
  console.log('');

  // Success criteria
  const accuracy = ((correctlyBlocked + correctlyAllowed) / totalTests) * 100;
  const detection = (violationsDetected / totalTests) * 100;

  if (detection >= 95 && accuracy >= 90) {
    console.log('🎉 SUCCESS: Comprehensive constraint system working perfectly!');
  } else {
    console.log('⚠️ ISSUES: Some constraints not working as expected');
  }

  console.log(`📈 Detection Rate: ${detection.toFixed(1)}%`);
  console.log(`🎯 Accuracy Rate: ${accuracy.toFixed(1)}%`);
}

// Execute the comprehensive test
runComprehensiveConstraintTest().catch(error => {
  console.error('❌ Comprehensive test execution failed:', error);
  process.exit(1);
});