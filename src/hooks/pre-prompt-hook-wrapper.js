#!/usr/bin/env node

/**
 * Pre-Prompt Hook Wrapper for Claude Code
 *
 * This script is called by Claude Code before processing user prompts.
 * It integrates with the Real Time Guardrails constraint enforcement system.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function processPromptHook() {
  try {
    // Read hook data from stdin (Claude Code format)
    let hookData = '';
    if (process.stdin.isTTY === false) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      hookData = Buffer.concat(chunks).toString('utf8').trim();
    }

    if (!hookData) {
      // No input data - allow continuation
      process.exit(0);
    }

    let promptData;
    try {
      promptData = JSON.parse(hookData);
    } catch (parseError) {
      // If not JSON, treat as plain text prompt
      promptData = { text: hookData };
    }

    // Extract the prompt text
    const promptText = promptData.text || promptData.content || promptData.prompt || hookData;

    if (!promptText || promptText.trim().length === 0) {
      // Empty prompt - allow continuation
      process.exit(0);
    }

    // Import and use the constraint enforcer
    const { prePromptHook } = await import('./real-time-constraint-hook.js');

    const context = {
      timestamp: Date.now(),
      source: 'claude-code-prompt-hook',
      workingDirectory: process.cwd(),
      sessionId: promptData.sessionId || 'unknown'
    };

    // Check constraints
    const result = await prePromptHook(promptText, context);

    if (result.continue) {
      // Prompt allowed - exit with success
      console.log('✅ Prompt passed constraint checks');
      process.exit(0);
    } else {
      // Should not reach here as prePromptHook throws on violations
      console.error('❌ Prompt blocked by constraints');
      process.exit(1);
    }

  } catch (error) {
    if (error.message.includes('CONSTRAINT VIOLATION')) {
      // Log the violation but don't show stack trace
      console.error(error.message);
      process.exit(1);
    } else {
      // Log other errors but allow continuation (fail open)
      console.error('⚠️ Prompt hook error:', error.message);
      process.exit(0);
    }
  }
}

processPromptHook();