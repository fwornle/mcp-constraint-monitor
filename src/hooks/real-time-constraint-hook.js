#!/usr/bin/env node

/**
 * Real-Time Constraint Enforcement Hook
 * 
 * This hook intercepts every user prompt and tool call to check for constraint violations
 * BEFORE execution. If violations are detected, it blocks execution and requires correction.
 * 
 * Usage: Called by Claude Code hook system on every interaction
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class RealTimeConstraintEnforcer {
  constructor() {
    this.projectPath = process.env.PWD || process.cwd();
    this.constraintConfigPath = this.findConstraintConfig();
    this.config = this.loadConfig();
    this.mcpServerUrl = 'http://localhost:3031'; // MCP constraint server
  }

  findConstraintConfig() {
    // Look for project-specific config first, then global
    const projectConfig = join(this.projectPath, '.constraint-monitor.yaml');
    const globalConfig = join(process.env.CODING_REPO || '', '.constraint-monitor.yaml');
    
    if (existsSync(projectConfig)) {
      return projectConfig;
    } else if (existsSync(globalConfig)) {
      return globalConfig;
    }
    return null;
  }

  loadConfig() {
    if (!this.constraintConfigPath) {
      return { enforcement: { enabled: false } };
    }

    try {
      // Use the existing constraint engine to load config
      const configScript = join(__dirname, '../config/load-constraints.js');
      const result = execSync(`node "${configScript}" "${this.constraintConfigPath}"`, {
        encoding: 'utf8',
        timeout: 3000
      });
      return JSON.parse(result);
    } catch (error) {
      console.error('⚠️ Failed to load constraint config:', error.message);
      return { enforcement: { enabled: false } };
    }
  }

  async checkConstraintsViaMCP(content, type, context = {}) {
    try {
      // Use the existing MCP constraint monitor to check violations
      const response = await fetch(`${this.mcpServerUrl}/api/constraints/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type,
          filePath: context.filePath,
          project: this.getProjectName()
        }),
        timeout: 5000
      });

      if (!response.ok) {
        return { violations: [], compliance: 10 }; // Fail open if server unavailable
      }

      const result = await response.json();
      return result.data || { violations: [], compliance: 10 };
    } catch (error) {
      console.error('🔴 Constraint server unavailable:', error.message);
      return { violations: [], compliance: 10 }; // Fail open
    }
  }

  getProjectName() {
    const segments = this.projectPath.split('/');
    return segments[segments.length - 1] || 'unknown';
  }

  shouldBlockViolation(violation) {
    const blockingLevels = this.config.enforcement?.blocking_levels || ['critical', 'error'];
    return blockingLevels.includes(violation.severity);
  }

  formatViolationMessage(violations) {
    const blockingViolations = violations.filter(v => this.shouldBlockViolation(v));
    
    if (blockingViolations.length === 0) {
      return null; // No blocking violations
    }

    const lines = [
      '🚫 **CONSTRAINT VIOLATION DETECTED - EXECUTION BLOCKED**',
      '',
      'The following constraint violations must be corrected before proceeding:',
      ''
    ];

    blockingViolations.forEach((violation, index) => {
      lines.push(`**${index + 1}. ${violation.severity.toUpperCase()}: ${violation.message}**`);
      if (violation.suggestion) {
        lines.push(`   💡 Suggestion: ${violation.suggestion}`);
      }
      if (violation.pattern) {
        lines.push(`   🔍 Pattern: \`${violation.pattern}\``);
      }
      lines.push('');
    });

    lines.push('Please modify your request to comply with these constraints and try again.');
    lines.push('');
    lines.push('📊 View detailed constraint information: http://localhost:3030');

    return lines.join('\n');
  }

  async enforcePromptConstraints(prompt, context = {}) {
    if (!this.config.enforcement?.enabled) {
      return { allowed: true };
    }

    const checkResult = await this.checkConstraintsViaMCP(prompt, 'prompt', context);
    const blockingMessage = this.formatViolationMessage(checkResult.violations || []);

    if (blockingMessage) {
      return {
        allowed: false,
        reason: 'constraint_violation',
        message: blockingMessage,
        violations: checkResult.violations
      };
    }

    return { allowed: true, compliance: checkResult.compliance };
  }

  async enforceToolConstraints(toolCall, context = {}) {
    if (!this.config.enforcement?.enabled) {
      return { allowed: true };
    }

    // Serialize tool call for constraint checking
    const toolContent = JSON.stringify({
      tool: toolCall.name,
      parameters: toolCall.parameters || toolCall.arguments,
      context: context
    }, null, 2);

    const checkResult = await this.checkConstraintsViaMCP(toolContent, 'tool_call', context);
    const blockingMessage = this.formatViolationMessage(checkResult.violations || []);

    if (blockingMessage) {
      return {
        allowed: false,
        reason: 'constraint_violation', 
        message: blockingMessage,
        violations: checkResult.violations
      };
    }

    return { allowed: true, compliance: checkResult.compliance };
  }
}

// Hook entry points for Claude Code integration
const enforcer = new RealTimeConstraintEnforcer();

/**
 * Pre-prompt hook: Called before Claude processes any user prompt
 */
export async function prePromptHook(prompt, context = {}) {
  try {
    const result = await enforcer.enforcePromptConstraints(prompt, context);
    
    if (!result.allowed) {
      // Block execution by throwing an error with the violation message
      throw new Error(result.message);
    }
    
    return { continue: true, compliance: result.compliance };
  } catch (error) {
    if (error.message.includes('CONSTRAINT VIOLATION')) {
      throw error; // Re-throw constraint violations to block execution
    }
    
    // Log other errors but don't block
    console.error('⚠️ Constraint hook error:', error.message);
    return { continue: true };
  }
}

/**
 * Pre-tool hook: Called before any tool execution
 */
export async function preToolHook(toolCall, context = {}) {
  try {
    const result = await enforcer.enforceToolConstraints(toolCall, context);
    
    if (!result.allowed) {
      // Block tool execution by throwing an error
      throw new Error(result.message);
    }
    
    return { continue: true, compliance: result.compliance };
  } catch (error) {
    if (error.message.includes('CONSTRAINT VIOLATION')) {
      throw error; // Re-throw constraint violations to block execution
    }
    
    // Log other errors but don't block
    console.error('⚠️ Tool constraint hook error:', error.message);
    return { continue: true };
  }
}

// CLI support for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, action, content] = process.argv;
  
  if (action === 'test-prompt') {
    const testPrompt = content || 'console.log("test")';
    prePromptHook(testPrompt).then(result => {
      console.log('Prompt check result:', result);
    }).catch(error => {
      console.error('Prompt blocked:', error.message);
    });
  } else if (action === 'test-tool') {
    const testTool = { name: 'Write', parameters: { content: 'var x = 1;' } };
    preToolHook(testTool).then(result => {
      console.log('Tool check result:', result);
    }).catch(error => {
      console.error('Tool blocked:', error.message);
    });
  } else {
    console.log('Usage: node real-time-constraint-hook.js [test-prompt|test-tool] [content]');
  }
}