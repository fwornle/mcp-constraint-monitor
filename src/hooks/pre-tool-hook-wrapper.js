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
    const toolCall = {
      name: toolData.tool_name || toolData.name || toolData.toolName || 'unknown',
      parameters: toolData.parameters || toolData.arguments || toolData.args || {},
      input: toolData.input || {}
    };

    if (!toolCall.name || toolCall.name === 'unknown') {
      // Cannot identify tool - allow continuation
      process.exit(0);
    }

    // Import and use the constraint enforcer
    const { preToolHook } = await import('./real-time-constraint-hook.js');

    const context = {
      timestamp: Date.now(),
      source: 'claude-code-tool-hook',
      workingDirectory: process.cwd(),
      sessionId: toolData.sessionId || 'unknown',
      toolName: toolCall.name
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
      process.exit(1);
    }

  } catch (error) {
    if (error.message.includes('CONSTRAINT VIOLATION')) {
      // Log the violation but don't show stack trace
      console.error(error.message);
      process.exit(1);
    } else {
      // Log other errors but allow continuation (fail open)
      console.error('⚠️ Tool hook error:', error.message);
      process.exit(0);
    }
  }
}

processToolHook();