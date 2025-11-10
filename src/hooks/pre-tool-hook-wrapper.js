#!/usr/bin/env node

/**
 * Pre-Tool Hook Wrapper for Claude Code
 *
 * This script is called by Claude Code before executing any tool.
 * It integrates with the Real Time Guardrails constraint enforcement system.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function processToolHook() {
  try {
    // Read hook data from stdin (Claude Code format)
    let hookData = '';
    // Read stdin regardless of TTY status (isTTY can be undefined)
    if (process.stdin.isTTY !== true) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        hookData = Buffer.concat(chunks).toString('utf8').trim();
      }
    }

    if (!hookData) {
      // No input data - allow continuation
      process.exit(0);
    }


    let toolData;
    try {
      toolData = JSON.parse(hookData);
    } catch (parseError) {
      // If not JSON, cannot process tool call - allow continuation
      console.error('⚠️ Invalid tool hook data format');
      process.exit(0);
    }

    // Extract tool call information
    // CRITICAL: Claude Code passes tool parameters in "tool_input" field (NOT "parameters" or "arguments")
    // See docs/CLAUDE-CODE-HOOK-FORMAT.md for complete documentation
    const toolName = toolData.tool_name || toolData.name || toolData.toolName;
    const toolParams = toolData.tool_input;

    if (!toolName) {
      // Cannot identify tool - allow continuation
      console.error('⚠️ No tool name in hook data - allowing continuation');
      process.exit(0);
    }

    if (!toolParams || typeof toolParams !== 'object') {
      // No valid parameters - allow continuation but log warning
      console.error(`⚠️ No tool_input for ${toolName} - allowing continuation`);
      process.exit(0);
    }

    // Extract constraint overrides if present
    // User can request override by including in their prompt: OVERRIDE_CONSTRAINT: constraint-id
    // Claude will then inject _constraint_override parameter in tool calls
    const constraintOverride = toolParams._constraint_override || null;

    const toolCall = {
      name: toolName,
      parameters: toolParams,
      input: toolParams
    };

    // Detect project from file path in tool parameters
    const detectProjectFromFilePath = (toolCall) => {
      // Extract file path from various tool parameters
      const filePath = toolCall.parameters?.file_path ||
                      toolCall.parameters?.path ||
                      toolCall.parameters?.filePath ||
                      toolCall.input?.file_path;

      if (!filePath) {
        return 'coding'; // Default to coding project
      }

      // Check which project the file belongs to based on path
      if (filePath.includes('/curriculum-alignment/')) {
        return 'curriculum-alignment';
      } else if (filePath.includes('/nano-degree/')) {
        return 'nano-degree';
      } else if (filePath.includes('/coding/')) {
        return 'coding';
      }

      // If no match, try to get project from cwd
      return 'coding'; // Default
    };

    const detectedProject = detectProjectFromFilePath(toolCall);

    // Import and use the constraint enforcer
    const { preToolHook } = await import('./real-time-constraint-hook.js');

    const context = {
      timestamp: Date.now(),
      source: 'claude-code-tool-hook',
      workingDirectory: process.cwd(),
      sessionId: toolData.sessionId || 'unknown',
      toolName: toolCall.name,
      project: detectedProject,  // Add detected project to context
      constraintOverride: constraintOverride  // Pass user-initiated override
    };

    // Check constraints
    const result = await preToolHook(toolCall, context);

    if (result.continue) {
      // Tool allowed - exit with success
      console.log(`✅ Tool ${toolCall.name} passed constraint checks`);
      process.exit(0);
    } else {
      // Should not reach here as preToolHook throws on violations
      console.error(`❌ Tool ${toolCall.name} blocked by constraints`);
      process.exit(2);  // Exit code 2 = blocking error, stderr fed to Claude
    }

  } catch (error) {
    if (error.message.includes('CONSTRAINT VIOLATION')) {
      // CRITICAL: Exit code 2 blocks execution and feeds stderr back to Claude
      // Claude will see the violation message and adapt its behavior
      console.error(error.message);
      process.exit(2);  // Exit code 2 = blocking error, stderr fed to Claude
    } else {
      // Log other errors but allow continuation (fail open)
      console.error('⚠️ Tool hook error:', error.message);
      process.exit(0);
    }
  }
}

processToolHook();