#!/usr/bin/env node

/**
 * Prompt Override Parser - UserPromptSubmit Hook
 *
 * Parses user prompts for OVERRIDE_CONSTRAINT directives and stores them
 * for the PreTool hook to consume.
 *
 * Usage in prompt:
 *   OVERRIDE_CONSTRAINT: constraint-id-1
 *   OVERRIDE_CONSTRAINT: constraint-id-2
 *
 * Creates temporary state file: /tmp/constraint-override-{pid}.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

async function parsePromptForOverrides() {
  try {
    // Read prompt from stdin
    let promptData = '';

    if (process.stdin.isTTY !== true) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        promptData = Buffer.concat(chunks).toString('utf8');
      }
    }

    if (!promptData) {
      // No prompt data - exit silently
      process.exit(0);
    }

    let userPrompt;
    try {
      const data = JSON.parse(promptData);
      userPrompt = data.prompt || data.message || data.content || promptData;
    } catch {
      // If not JSON, treat entire input as prompt
      userPrompt = promptData;
    }

    // Parse OVERRIDE_CONSTRAINT directives
    const overridePattern = /OVERRIDE_CONSTRAINT:\s*([a-zA-Z0-9_-]+)/g;
    const matches = [...userPrompt.matchAll(overridePattern)];

    if (matches.length === 0) {
      // No overrides requested - exit silently
      process.exit(0);
    }

    // Extract constraint IDs
    const constraintIds = matches.map(m => m[1]);

    // Create override state file
    const sessionId = process.env.CLAUDE_SESSION_ID || process.ppid || Date.now();
    const stateFile = join(tmpdir(), `constraint-override-${sessionId}.json`);

    const overrideState = {
      constraintIds,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes TTL
      promptCount: 0,
      maxPrompts: 3 // Expire after 3 prompts
    };

    writeFileSync(stateFile, JSON.stringify(overrideState, null, 2));

    // Output informational message for user context (hooks CAN output to stderr on exit 0)
    console.error(`✅ Constraint override active for: ${constraintIds.join(', ')}`);
    console.error(`   Valid for 3 prompts or 5 minutes`);

    process.exit(0);

  } catch (error) {
    // Fail open - don't block on errors
    console.error('⚠️ Override parser error:', error.message);
    process.exit(0);
  }
}

parsePromptForOverrides();
