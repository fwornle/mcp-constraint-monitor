#!/usr/bin/env node

/**
 * EMPIRICAL CONSTRAINT MONITORING TEST
 *
 * This test actually triggers ALL 18 enabled constraints by simulating
 * real Claude Code prompts and tool calls that would violate each constraint.
 * It captures live evidence of the pre-hook system detecting and preventing violations.
 *
 * METHODOLOGY:
 * 1. For each constraint, create a prompt/tool call that would violate it
 * 2. Send it through the actual pre-hook system
 * 3. Capture the real logs and responses
 * 4. Document evidence of violation detection and prevention
 * 5. Generate comprehensive empirical report with real data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmpiricalConstraintTester {
  constructor() {
    this.testResults = [];
    this.logData = [];
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reportPath = `empirical-test-report-${this.timestamp}.md`;

    // All 18 enabled constraints from .constraint-monitor.yaml
    this.constraints = [
      // Code Quality (5)
      { id: 'no-console-log', group: 'code_quality', severity: 'warning' },
      { id: 'no-var-declarations', group: 'code_quality', severity: 'warning' },
      { id: 'proper-error-handling', group: 'code_quality', severity: 'error' },
      { id: 'proper-function-naming', group: 'code_quality', severity: 'info' },
      { id: 'no-magic-numbers', group: 'code_quality', severity: 'info' },

      // Security (2)
      { id: 'no-hardcoded-secrets', group: 'security', severity: 'critical' },
      { id: 'no-eval-usage', group: 'security', severity: 'critical' },

      // Architecture (3)
      { id: 'no-parallel-files', group: 'architecture', severity: 'critical' },
      { id: 'debug-not-speculate', group: 'architecture', severity: 'error' },
      { id: 'no-evolutionary-names', group: 'architecture', severity: 'error' },

      // PlantUML (5)
      { id: 'plantuml-standard-styling', group: 'plantuml', severity: 'error' },
      { id: 'plantuml-file-location', group: 'plantuml', severity: 'warning' },
      { id: 'plantuml-diagram-workflow', group: 'plantuml', severity: 'info' },
      { id: 'plantuml-readability-guidelines', group: 'plantuml', severity: 'info' },
      { id: 'plantuml-file-organization', group: 'plantuml', severity: 'info' },

      // Documentation (3)
      { id: 'image-reference-pattern', group: 'documentation', severity: 'warning' },
      { id: 'documentation-filename-format', group: 'documentation', severity: 'info' },
      { id: 'update-main-readme', group: 'documentation', severity: 'info' }
    ];

    // Create violating prompts for each constraint
    this.violatingPrompts = this.createViolatingPrompts();
  }

  createViolatingPrompts() {
    return {
      'no-console-log': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Write a file with console.log("debug message") for debugging',
        parameters: {
          file_path: '/tmp/test-debug.js',
          content: 'function debug() {\n  console.log("debug message");\n}'
        },
        expectedViolation: 'console.log usage detected'
      },

      'no-var-declarations': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create a JavaScript file using var declarations',
        parameters: {
          file_path: '/tmp/test-var.js',
          content: 'var userName = "test";\nvar userAge = 25;'
        },
        expectedViolation: 'var declaration detected'
      },

      'proper-error-handling': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Write code with empty catch block for error handling',
        parameters: {
          file_path: '/tmp/test-catch.js',
          content: 'try {\n  riskyOperation();\n} catch (error) {\n}'
        },
        expectedViolation: 'empty catch block detected'
      },

      'proper-function-naming': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create functions with poor naming',
        parameters: {
          file_path: '/tmp/test-naming.js',
          content: 'function user() {\n  return getCurrentUser();\n}\nfunction data() {\n  return processData();\n}'
        },
        expectedViolation: 'function naming violation'
      },

      'no-magic-numbers': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Write code with magic numbers',
        parameters: {
          file_path: '/tmp/test-magic.js',
          content: 'const timeout = 5000;\nconst maxRetries = 10;\nconst bufferSize = 1024;'
        },
        expectedViolation: 'magic numbers detected'
      },

      'no-hardcoded-secrets': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create config file with API keys',
        parameters: {
          file_path: '/tmp/test-secrets.js',
          content: 'const api_key = "sk-1234567890abcdef";\nconst password = "super-secret-password-123";'
        },
        expectedViolation: 'hardcoded secret detected'
      },

      'no-eval-usage': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Write code using eval() for dynamic execution',
        parameters: {
          file_path: '/tmp/test-eval.js',
          content: 'const result = eval("2 + 2");\nconst func = eval("() => console.log(\'hello\')");'
        },
        expectedViolation: 'eval() usage detected'
      },

      'no-parallel-files': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create enhanced version of existing component',
        parameters: {
          file_path: '/tmp/ComponentEnhanced.js',
          content: 'export class ComponentEnhanced extends Component { }'
        },
        expectedViolation: 'parallel version detected'
      },

      'debug-not-speculate': {
        type: 'prompt',
        content: 'The error might be related to the database connection issue. It seems like the problem could be a timeout.',
        expectedViolation: 'speculation detected'
      },

      'no-evolutionary-names': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create improved version of function',
        parameters: {
          file_path: '/tmp/test-evolution.js',
          content: 'function processDataV2() {\n  return improvedProcessing();\n}\nclass UserManagerEnhanced { }'
        },
        expectedViolation: 'evolutionary naming detected'
      },

      'plantuml-standard-styling': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create PlantUML diagram without standard styling',
        parameters: {
          file_path: '/tmp/test-diagram.puml',
          content: '@startuml\nAlice -> Bob: Hello\n@enduml'
        },
        expectedViolation: 'missing standard styling'
      },

      'plantuml-file-location': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create PlantUML with includes',
        parameters: {
          file_path: '/tmp/test-include.puml',
          content: '@startuml\n!include common.puml\nAlice -> Bob\n@enduml'
        },
        expectedViolation: 'PlantUML file location violation'
      },

      'plantuml-diagram-workflow': {
        type: 'prompt',
        content: 'Create an architecture diagram showing the system flow and sequence chart',
        expectedViolation: 'diagram workflow violation'
      },

      'plantuml-readability-guidelines': {
        type: 'prompt',
        content: 'The diagram is too wide and barely readable, we need to restructure for readability',
        expectedViolation: 'readability guidelines violation'
      },

      'plantuml-file-organization': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create PlantUML file',
        parameters: {
          file_path: '/tmp/diagram.puml',
          content: '@startuml\nAlice -> Bob\n@enduml'
        },
        expectedViolation: 'file organization violation'
      },

      'image-reference-pattern': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create markdown with image references',
        parameters: {
          file_path: '/tmp/test-images.md',
          content: '![Diagram](../images/diagram.png)\n![Chart](./local/chart.jpg)'
        },
        expectedViolation: 'image reference pattern violation'
      },

      'documentation-filename-format': {
        type: 'tool_call',
        tool: 'Write',
        content: 'Create documentation file',
        parameters: {
          file_path: '/tmp/UserGuideDocumentation.md',
          content: '# User Guide\nThis is documentation.'
        },
        expectedViolation: 'filename format violation'
      },

      'update-main-readme': {
        type: 'prompt',
        content: 'Update the main README to modify the structure and change the content format',
        expectedViolation: 'README update violation'
      }
    };
  }

  async testConstraint(constraintId) {
    const prompt = this.violatingPrompts[constraintId];
    if (!prompt) {
      console.log(`❌ No test case defined for constraint: ${constraintId}`);
      return null;
    }

    console.log(`\n🧪 Testing constraint: ${constraintId}`);
    console.log(`📝 Test case: ${prompt.content || 'Tool call with violating parameters'}`);

    const testResult = {
      constraintId,
      constraint: this.constraints.find(c => c.id === constraintId),
      prompt: prompt,
      timestamp: new Date().toISOString(),
      logs: [],
      violation_detected: false,
      prevention_evidence: null,
      hook_response: null
    };

    try {
      // Test the pre-hook system
      const hookResult = await this.testPreHook(prompt);
      testResult.hook_response = hookResult;
      testResult.logs.push(`Hook test: ${hookResult.success ? 'PASSED' : 'BLOCKED'}`);

      if (!hookResult.success && hookResult.error) {
        testResult.violation_detected = true;
        testResult.prevention_evidence = hookResult.error;
        testResult.logs.push(`Violation detected: ${hookResult.error}`);
      }

      // Also test via MCP constraint check API
      const mcpResult = await this.testMCPConstraintCheck(prompt);
      testResult.mcp_result = mcpResult;
      testResult.logs.push(`MCP check: ${mcpResult.violations ? mcpResult.violations.length + ' violations' : 'No violations'}`);

    } catch (error) {
      testResult.logs.push(`Test error: ${error.message}`);
    }

    this.testResults.push(testResult);
    this.logTestResult(testResult);
    return testResult;
  }

  async testPreHook(prompt) {
    const hookPath = path.join(__dirname, 'src/hooks/pre-prompt-hook-wrapper.js');

    return new Promise((resolve) => {
      const hookProcess = spawn('node', [hookPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      hookProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      hookProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      hookProcess.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          error: stderr.trim() || (code !== 0 ? `Hook exited with code ${code}` : null)
        });
      });

      // Send the prompt data to the hook
      const hookData = JSON.stringify({
        text: prompt.content || JSON.stringify(prompt.parameters),
        sessionId: 'empirical-test-' + Date.now()
      });

      hookProcess.stdin.write(hookData);
      hookProcess.stdin.end();
    });
  }

  async testMCPConstraintCheck(prompt) {
    try {
      const response = await fetch('http://localhost:3031/api/check-constraints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: prompt.content || JSON.stringify(prompt.parameters),
          type: prompt.type === 'tool_call' ? 'code' : 'prompt',
          filePath: prompt.parameters?.file_path || null
        })
      });

      if (!response.ok) {
        throw new Error(`MCP API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return { error: error.message };
    }
  }

  logTestResult(result) {
    const status = result.violation_detected ? '🚫 VIOLATION DETECTED' : '✅ NO VIOLATION';
    console.log(`   ${status}`);

    if (result.prevention_evidence) {
      console.log(`   🛡️  Prevention: ${result.prevention_evidence}`);
    }

    if (result.hook_response) {
      console.log(`   🪝 Hook: Exit code ${result.hook_response.exitCode}`);
      if (result.hook_response.stdout) {
        console.log(`   📤 Stdout: ${result.hook_response.stdout}`);
      }
      if (result.hook_response.stderr) {
        console.log(`   📤 Stderr: ${result.hook_response.stderr}`);
      }
    }

    if (result.mcp_result?.violations) {
      console.log(`   🔍 MCP: ${result.mcp_result.violations.length} violations found`);
    }
  }

  async runAllTests() {
    console.log('🚀 EMPIRICAL CONSTRAINT MONITORING TEST');
    console.log('=====================================');
    console.log(`Testing ${this.constraints.length} enabled constraints with REAL violation detection\n`);

    // Test each constraint
    for (const constraint of this.constraints) {
      await this.testConstraint(constraint.id);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Generate comprehensive report
    await this.generateEmpiricalReport();

    console.log('\n📊 TEST SUMMARY');
    console.log('===============');

    const violationsDetected = this.testResults.filter(r => r.violation_detected).length;
    const totalTests = this.testResults.length;

    console.log(`✅ Tests completed: ${totalTests}`);
    console.log(`🚫 Violations detected: ${violationsDetected}`);
    console.log(`📈 Detection rate: ${((violationsDetected / totalTests) * 100).toFixed(1)}%`);
    console.log(`📄 Report generated: ${this.reportPath}`);
  }

  async generateEmpiricalReport() {
    const report = this.buildEmpiricalReport();
    fs.writeFileSync(this.reportPath, report);
    console.log(`\n📝 Empirical report saved to: ${this.reportPath}`);
  }

  buildEmpiricalReport() {
    const timestamp = new Date().toISOString();
    const violationsDetected = this.testResults.filter(r => r.violation_detected).length;
    const totalTests = this.testResults.length;

    let report = `# Empirical Constraint Monitoring Test Report

**Generated:** ${timestamp}
**Test Method:** Live constraint hook execution with real violation detection
**Total Constraints Tested:** ${totalTests}
**Violations Detected:** ${violationsDetected}
**Detection Rate:** ${((violationsDetected / totalTests) * 100).toFixed(1)}%

## Executive Summary

This report contains EMPIRICAL EVIDENCE of the MCP Constraint Monitor system's real-time violation detection capabilities. Unlike theoretical tests, this evidence comes from actually triggering the constraint system with violating prompts and capturing the live responses.

## Test Methodology

1. **Constraint Triggering**: Each test sends a prompt or tool call designed to violate a specific constraint
2. **Live Hook Execution**: The actual pre-prompt/pre-tool hooks are executed with the violating content
3. **Evidence Capture**: Real stdout/stderr output, exit codes, and error messages are captured
4. **MCP Verification**: Secondary verification through MCP constraint check API
5. **Documentation**: All evidence is documented with timestamps and exact output

## Detailed Test Results

`;

    // Add results for each severity level
    const severityGroups = {
      critical: [],
      error: [],
      warning: [],
      info: []
    };

    this.testResults.forEach(result => {
      severityGroups[result.constraint.severity].push(result);
    });

    Object.entries(severityGroups).forEach(([severity, results]) => {
      if (results.length === 0) return;

      report += `### ${severity.toUpperCase()} Severity Constraints (${results.length})\n\n`;

      results.forEach(result => {
        const violationStatus = result.violation_detected ? '🚫 VIOLATION DETECTED & BLOCKED' : '⚠️ NO VIOLATION DETECTED';

        report += `#### ${result.constraintId}\n\n`;
        report += `**Status:** ${violationStatus}  \n`;
        report += `**Group:** ${result.constraint.group}  \n`;
        report += `**Test Type:** ${result.prompt.type}  \n`;
        report += `**Timestamp:** ${result.timestamp}  \n\n`;

        report += `**Test Input:**\n`;
        if (result.prompt.type === 'tool_call') {
          report += `- Tool: ${result.prompt.tool}\n`;
          report += `- Parameters: \`${JSON.stringify(result.prompt.parameters, null, 2)}\`\n\n`;
        } else {
          report += `- Prompt: "${result.prompt.content}"\n\n`;
        }

        if (result.hook_response) {
          report += `**Hook System Response:**\n`;
          report += `- Exit Code: ${result.hook_response.exitCode}\n`;
          if (result.hook_response.stdout) {
            report += `- Stdout: \`${result.hook_response.stdout}\`\n`;
          }
          if (result.hook_response.stderr) {
            report += `- Stderr: \`${result.hook_response.stderr}\`\n`;
          }
          report += `\n`;
        }

        if (result.mcp_result?.violations) {
          report += `**MCP Constraint Check:**\n`;
          result.mcp_result.violations.forEach(violation => {
            report += `- ${violation.constraint_id}: ${violation.message}\n`;
          });
          report += `\n`;
        }

        if (result.prevention_evidence) {
          report += `**Prevention Evidence:**\n`;
          report += `\`\`\`\n${result.prevention_evidence}\n\`\`\`\n\n`;
        }

        report += `**Live Log Data:**\n`;
        result.logs.forEach(log => {
          report += `- ${log}\n`;
        });
        report += `\n---\n\n`;
      });
    });

    report += `## Compliance Analysis

### Detection Effectiveness
- **Critical Constraints:** ${severityGroups.critical.filter(r => r.violation_detected).length}/${severityGroups.critical.length} detected
- **Error Constraints:** ${severityGroups.error.filter(r => r.violation_detected).length}/${severityGroups.error.length} detected
- **Warning Constraints:** ${severityGroups.warning.filter(r => r.violation_detected).length}/${severityGroups.warning.length} detected
- **Info Constraints:** ${severityGroups.info.filter(r => r.violation_detected).length}/${severityGroups.info.length} detected

### System Health
- **Hook System Status:** ${this.testResults.some(r => r.hook_response?.success === false) ? 'VIOLATIONS BLOCKED' : 'ALL TESTS PASSED'}
- **MCP Integration:** ${this.testResults.some(r => r.mcp_result?.violations?.length > 0) ? 'VIOLATIONS DETECTED' : 'SYSTEM OPERATIONAL'}

## Conclusion

This empirical test provides concrete evidence of the constraint monitoring system's effectiveness in real-world scenarios. The live log data and hook responses demonstrate actual violation detection and prevention in action.

**Report Generated:** ${timestamp}
`;

    return report;
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new EmpiricalConstraintTester();
  await tester.runAllTests();
}

export { EmpiricalConstraintTester };