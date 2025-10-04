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
    // Direct constraint engine integration - no HTTP calls needed
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
      const config = JSON.parse(result);

      // Add default enforcement settings if not present
      if (!config.enforcement) {
        config.enforcement = {
          enabled: true,
          blocking_levels: ['critical', 'error'],
          warning_levels: ['warning'],
          info_levels: ['info'],
          fail_open: true
        };
      }

      return config;
    } catch (error) {
      console.error('⚠️ Failed to load constraint config:', error.message);
      return { enforcement: { enabled: false } };
    }
  }

  async checkConstraintsDirectly(content, type, context = {}) {
    try {
      // Use the constraint engine directly instead of HTTP API calls
      const { ConstraintEngine } = await import('../engines/constraint-engine.js');
      const { ConfigManager } = await import('../utils/config-manager.js');

      const configManager = new ConfigManager();
      const constraintEngine = new ConstraintEngine(configManager);
      await constraintEngine.initialize();

      const result = await constraintEngine.checkConstraints({
        content,
        type,
        filePath: context.filePath
      });

      return result;
    } catch (error) {
      console.error('🔴 Constraint checking error:', error.message);
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

    const checkResult = await this.checkConstraintsDirectly(prompt, 'prompt', context);

    // Log ALL violations to dashboard BEFORE deciding whether to block
    if (checkResult.violations && checkResult.violations.length > 0) {
      await this.logViolationsToStorage(checkResult.violations, context, 'prompt');
    }

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

    // Extract the actual content from tool calls for constraint checking
    let contentToCheck = '';
    const params = toolCall.parameters || toolCall.arguments || {};

    // For Write/Edit tool calls, check the content being written
    if (['Write', 'Edit', 'MultiEdit'].includes(toolCall.name)) {
      contentToCheck = params.content || params.new_string || '';
      // Also check old_string for Edit operations
      if (params.old_string) {
        contentToCheck += '\n' + params.old_string;
      }
      // For MultiEdit, check all edits
      if (params.edits && Array.isArray(params.edits)) {
        params.edits.forEach(edit => {
          contentToCheck += '\n' + (edit.new_string || '') + '\n' + (edit.old_string || '');
        });
      }

      // SPECIAL CASE: For file path constraints, also check the file path
      if (params.file_path) {
        contentToCheck += '\n' + params.file_path;
      }
    } else {
      // For other tools, serialize the entire call
      contentToCheck = JSON.stringify({
        tool: toolCall.name,
        parameters: params,
        context: context
      }, null, 2);
    }

    const checkResult = await this.checkConstraintsDirectly(contentToCheck, 'tool_call', context);

    // Log ALL violations to dashboard BEFORE deciding whether to block
    if (checkResult.violations && checkResult.violations.length > 0) {
      await this.logViolationsToStorage(checkResult.violations, { ...context, filePath: params.file_path }, 'tool_call');
    }

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

  async logViolationsToStorage(violations, context, type) {
    try {
      const { readFileSync, writeFileSync } = await import('fs');
      const violationStoragePath = '/Users/q284340/Agentic/coding/.mcp-sync/violation-history.json';

      // Read existing violations
      let existingData = { violations: [] };
      try {
        const content = readFileSync(violationStoragePath, 'utf8');
        existingData = JSON.parse(content);
      } catch (error) {
        console.log('Creating new violation storage...');
      }

      // Add each violation with full context
      for (const violation of violations) {
        const loggedViolation = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          timestamp: new Date().toISOString(),
          sessionId: context.sessionId || `live-session-${Date.now()}`,
          constraint_id: violation.constraint_id,
          message: violation.message,
          severity: violation.severity,
          tool: type === 'prompt' ? 'live-prompt-hook' : 'live-tool-hook',
          context: 'coding',
          project: 'coding',
          repository: 'coding',
          source: 'main',
          file_path: context.filePath || 'live-constraint-test',
          matches: violation.matches || 1,
          detected_at: new Date().toISOString(),
          pattern: violation.pattern
        };

        existingData.violations.push(loggedViolation);
        console.log(`📝 LOGGED TO DASHBOARD: ${violation.constraint_id} (${violation.severity})`);
      }

      // Write back to storage
      writeFileSync(violationStoragePath, JSON.stringify(existingData, null, 2));
    } catch (error) {
      console.error('❌ Failed to log violations to storage:', error);
    }
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