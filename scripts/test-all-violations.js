#!/usr/bin/env node

/**
 * Comprehensive Constraint Violation Test Suite
 *
 * This script tests all configured constraints to verify they are properly
 * detected by the constraint monitoring system and logged to the dashboard.
 */

import { ConfigManager } from '../src/utils/config-manager.js';
import { ConstraintEngine } from '../src/engines/constraint-engine.js';
import { logger } from '../src/utils/logger.js';

// Test data for each constraint type
const TEST_CASES = {
  'no-console-log': {
    code: `console.log("Testing console.log detection");
function testFunction() {
  console.log('Another console.log statement');
  return true;
}`,
    description: 'console.log usage detection'
  },

  'no-var-declarations': {
    code: `var oldStyleVariable = 'test';
function oldFunction() {
  var anotherVar = 42;
  return anotherVar;
}`,
    description: 'var declaration detection'
  },

  'proper-error-handling': {
    code: `try {
  riskyOperation();
} catch (error) {
  // Empty catch block - should be detected
}
function anotherFunction() {
  try {
    anotherRiskyOperation();
  } catch (e) {
    // Another empty catch
  }
}`,
    description: 'empty catch blocks detection'
  },

  'proper-function-naming': {
    code: `function data() {
  return {};
}
function user() {
  return null;
}`,
    description: 'improper function naming (should start with verb)'
  },

  'no-magic-numbers': {
    code: `const timeout = 5000;
function calculate() {
  return value * 100 + 250;
}
const config = {
  maxRetries: 10,
  bufferSize: 1024
};`,
    description: 'magic numbers detection'
  },

  'no-hardcoded-secrets': {
    code: `const apiKey = "abc123def456ghi789jkl012mno345pqr678";
const password = "mySecretPassword123";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";`,
    description: 'hardcoded secrets detection'
  },

  'no-eval-usage': {
    code: `function dynamicCode(expression) {
  return eval(expression);
}
const result = eval("2 + 2");`,
    description: 'eval() usage detection'
  },

  'no-parallel-files': {
    code: `// File content that mentions parallel versions
const userServiceV2 = require('./userServiceV2');
const enhancedProcessor = new EnhancedDataProcessor();
const improvedVersion = loadImprovedAlgorithm();`,
    description: 'parallel file naming detection'
  },

  'debug-not-speculate': {
    code: `// Code with speculative language
console.log("This might be causing the error");
// Maybe the database connection is timing out
// Probably an issue with the API response
// Could be a race condition`,
    description: 'speculative debugging language detection'
  },

  'no-evolutionary-names': {
    code: `class UserServiceV2 {
  constructor() {}
}
function getDataEnhanced() {
  return {};
}
const improvedCalculator = new Calculator();`,
    description: 'evolutionary naming in code detection'
  },

  'plantuml-standard-styling': {
    code: `@startuml
!theme plain
title My Diagram
Alice -> Bob: Hello
@enduml`,
    description: 'PlantUML without standard styling'
  },

  'plantuml-file-location': {
    code: `@startuml
!include common/styles.puml
!include ../shared/definitions.puml
Alice -> Bob: Hello
@enduml`,
    description: 'PlantUML include paths not in docs/puml/'
  },

  'plantuml-diagram-workflow': {
    code: `# System Architecture Diagram
This architecture diagram shows the main components.

## Flow Chart Documentation
We need to create a sequence diagram for this workflow.`,
    description: 'References to diagrams without PlantUML workflow'
  },

  'plantuml-readability-guidelines': {
    code: `# Diagram Review
This diagram is too wide and barely readable.
We need to restructure for better readability.`,
    description: 'PlantUML readability issues'
  },

  'plantuml-file-organization': {
    code: `// File reference: my-diagram.puml
// Another file: system.puml
const diagramPath = 'workflow.puml';`,
    description: 'PlantUML file naming convention'
  },

  'image-reference-pattern': {
    code: `# Documentation
![Architecture](images/arch.png)
![Flow](../assets/flow.jpg)
![Diagram](static/diagram.svg)`,
    description: 'Image references not in docs/images/'
  },

  'documentation-filename-format': {
    code: `// References to documentation files
import UserGuide from './UserGuide.md';
const docPath = 'SystemArchitecture.md';
const readme = 'ProjectSetup.md';`,
    description: 'Documentation files not in kebab-case'
  },

  'update-main-readme': {
    code: `// Comments about README updates
// Need to update README structure
// Modify README content and format
// Change README to include new sections`,
    description: 'README update references'
  },

  'react-hooks-deps': {
    code: `import React, { useEffect, useState } from 'react';
function Component() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(setData);
  }, []); // Empty deps array - might be intentional

  return <div>{data}</div>;
}`,
    description: 'React useEffect with empty dependencies'
  },

  'react-state-complexity': {
    code: `import React, { useState } from 'react';
function ComplexComponent() {
  const [state, setState] = useState({
    user: { name: '', email: '', preferences: {} },
    ui: { loading: false, error: null, theme: 'light' },
    data: { items: [], total: 0, page: 1 }
  });

  return <div>Complex state management</div>;
}`,
    description: 'Complex object in useState'
  }
};

// Dashboard update function to show violation on timeline
async function logViolationToTimeline(constraintId, violation) {
  try {
    // Send to API endpoint to create a timeline entry
    const response = await fetch('http://localhost:3031/api/violations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        violations: [{
          constraint_id: constraintId,
          message: violation.message,
          severity: violation.severity,
          source: 'violation_test',
          context: 'coding',
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (response.ok) {
      console.log(`✅ Violation logged to dashboard timeline: ${constraintId}`);
    } else {
      const responseText = await response.text();
      console.log(`⚠️  Failed to log to timeline: ${constraintId} - ${responseText}`);
    }
  } catch (error) {
    console.log(`⚠️  Timeline logging error: ${error.message}`);
  }
}

// Color coding for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function runViolationTests() {
  console.log(colorize('\n🛡️  Comprehensive Constraint Violation Test Suite', 'cyan'));
  console.log(colorize('=' .repeat(60), 'gray'));

  try {
    // Initialize system
    console.log(colorize('\n📋 Initializing constraint system...', 'blue'));
    const configManager = new ConfigManager();
    const constraintEngine = new ConstraintEngine(configManager);
    await constraintEngine.initialize();

    const constraints = configManager.getConstraints();
    console.log(colorize(`   ✓ Loaded ${constraints.length} total constraints`, 'green'));

    // Filter enabled constraints
    const enabledConstraints = constraints.filter(c => c.enabled);
    console.log(colorize(`   ✓ Found ${enabledConstraints.length} enabled constraints`, 'green'));

    // Test results tracking
    let totalTests = 0;
    let violationsDetected = 0;
    let timelineUpdates = 0;
    const results = [];

    console.log(colorize('\n🔍 Running violation detection tests...', 'blue'));
    console.log(colorize('-'.repeat(60), 'gray'));

    for (const constraint of enabledConstraints) {
      const testCase = TEST_CASES[constraint.id];

      if (!testCase) {
        console.log(colorize(`   ⚠️  No test case for: ${constraint.id}`, 'yellow'));
        continue;
      }

      totalTests++;
      console.log(colorize(`\n${totalTests}. Testing: ${constraint.id}`, 'magenta'));
      console.log(colorize(`   Description: ${testCase.description}`, 'gray'));

      try {
        const result = await constraintEngine.checkConstraints({
          content: testCase.code,
          type: 'code',
          filePath: `test-${constraint.id}.js`
        });

        if (result.violations && result.violations.length > 0) {
          violationsDetected++;
          const violation = result.violations.find(v => v.constraint_id === constraint.id);

          if (violation) {
            console.log(colorize(`   ✅ DETECTED: ${violation.message}`, 'green'));
            console.log(colorize(`   📊 Severity: ${violation.severity}`, 'gray'));
            console.log(colorize(`   🎯 Matches: ${violation.matches}`, 'gray'));

            // Log to dashboard timeline
            await logViolationToTimeline(constraint.id, violation);
            timelineUpdates++;

            results.push({
              constraint: constraint.id,
              status: 'detected',
              severity: violation.severity,
              matches: violation.matches,
              message: violation.message
            });
          } else {
            console.log(colorize(`   ❌ MISSED: Expected ${constraint.id} but not found in results`, 'red'));
            results.push({
              constraint: constraint.id,
              status: 'missed',
              expected: true
            });
          }
        } else {
          console.log(colorize(`   ❌ NOT DETECTED: No violations found`, 'red'));
          results.push({
            constraint: constraint.id,
            status: 'not_detected',
            expected: true
          });
        }

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.log(colorize(`   💥 ERROR: ${error.message}`, 'red'));
        results.push({
          constraint: constraint.id,
          status: 'error',
          error: error.message
        });
      }
    }

    // Summary report
    console.log(colorize('\n📊 Test Results Summary', 'cyan'));
    console.log(colorize('=' .repeat(60), 'gray'));
    console.log(colorize(`Total tests run: ${totalTests}`, 'blue'));
    console.log(colorize(`Violations detected: ${violationsDetected}`, 'green'));
    console.log(colorize(`Timeline updates: ${timelineUpdates}`, 'green'));
    console.log(colorize(`Detection rate: ${((violationsDetected/totalTests)*100).toFixed(1)}%`, 'yellow'));

    // Detailed results by severity
    const bySeverity = results.reduce((acc, r) => {
      if (r.status === 'detected') {
        acc[r.severity] = (acc[r.severity] || 0) + 1;
      }
      return acc;
    }, {});

    console.log(colorize('\n🎯 Violations by Severity:', 'cyan'));
    Object.entries(bySeverity).forEach(([severity, count]) => {
      const color = severity === 'critical' ? 'red' :
                   severity === 'error' ? 'yellow' : 'green';
      console.log(colorize(`   ${severity}: ${count}`, color));
    });

    // Failed detections
    const failed = results.filter(r => r.status !== 'detected');
    if (failed.length > 0) {
      console.log(colorize('\n⚠️  Failed Detections:', 'yellow'));
      failed.forEach(f => {
        console.log(colorize(`   - ${f.constraint}: ${f.status}`, 'red'));
      });
    }

    console.log(colorize('\n🌐 Dashboard Access:', 'cyan'));
    console.log(colorize('   View timeline: http://localhost:3030', 'blue'));
    console.log(colorize('   API status: http://localhost:3030/api/status', 'blue'));

    console.log(colorize('\n✅ Violation testing complete!', 'green'));

    return {
      totalTests,
      violationsDetected,
      timelineUpdates,
      results,
      detectionRate: (violationsDetected/totalTests)*100
    };

  } catch (error) {
    console.error(colorize(`\n💥 Fatal error: ${error.message}`, 'red'));
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runViolationTests().then(results => {
    console.log(colorize(`\nTest completed with ${results.detectionRate.toFixed(1)}% detection rate`, 'green'));
    process.exit(0);
  }).catch(error => {
    console.error(colorize(`Test failed: ${error.message}`, 'red'));
    process.exit(1);
  });
}

/**
 * How Claude Addresses Detected Violations:
 *
 * When Claude detects violations through the constraint monitoring system:
 *
 * 1. **Immediate Prevention**: Pre-tool hooks block actions that would create violations
 * 2. **Real-time Feedback**: Status line updates show compliance score and violation count
 * 3. **Dashboard Logging**: All violations are logged to the timeline for tracking
 * 4. **Suggested Fixes**: Each constraint provides specific suggestions for resolution
 *
 * Example responses to detected violations:
 *
 * - **console.log detected**: Claude will suggest using Logger.log() instead
 * - **var declarations**: Claude will recommend using 'let' or 'const'
 * - **hardcoded secrets**: Claude will advise using environment variables
 * - **eval() usage**: Claude will suggest safer alternatives for dynamic code
 * - **empty catch blocks**: Claude will recommend proper error handling
 *
 * The system maintains a compliance score (0-10) and risk assessment:
 * - 9.0+: Excellent compliance (green)
 * - 7.0-8.9: Good compliance (blue)
 * - 5.0-6.9: Warning compliance (yellow)
 * - <5.0: Poor compliance (red)
 *
 * Critical violations immediately set risk level to 'critical', while multiple
 * error or warning violations escalate risk levels progressively.
 */

export { runViolationTests, TEST_CASES };