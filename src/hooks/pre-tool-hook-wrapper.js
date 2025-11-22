#!/usr/bin/env node

/**
 * Pre-Tool Hook Wrapper for Claude Code
 *
 * This script is called by Claude Code before executing any tool.
 * It integrates with the Real Time Guardrails constraint enforcement system.
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function processToolHook() {
  // CRITICAL: Set environment variable to suppress console logging
  // Hooks MUST be silent (no stdout/stderr) when exiting with code 0
  process.env.CLAUDE_CODE_HOOK = 'true';

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

    // Track skill invocations for skill-required constraints
    const sessionId = process.env.CLAUDE_SESSION_ID || process.ppid || 'default';
    const skillStateFile = join(tmpdir(), `skill-invocations-${sessionId}.json`);

    // Detect Skill tool invocations and track them
    if (toolName === 'Skill' && toolParams.skill) {
      const skillName = toolParams.skill;
      const now = Date.now();
      const skillState = {
        skills: {
          [skillName]: {
            invokedAt: now,
            expiresAt: now + (30 * 60 * 1000) // 30 minutes
          }
        }
      };

      try {
        // If state file exists, merge with existing skills
        if (existsSync(skillStateFile)) {
          const existingState = JSON.parse(readFileSync(skillStateFile, 'utf8'));
          skillState.skills = { ...existingState.skills, ...skillState.skills };
        }

        writeFileSync(skillStateFile, JSON.stringify(skillState, null, 2));
        console.error(`✅ Skill invoked: ${skillName} (valid for 30 minutes)`);
      } catch (error) {
        console.error('⚠️ Failed to track skill invocation:', error.message);
      }

      // Allow skill invocation to proceed (no constraints on Skill tool itself)
      process.exit(0);
    }

    // Extract constraint overrides from prompt-override-parser state file
    // User can request override by including in their prompt: OVERRIDE_CONSTRAINT: constraint-id
    // The prompt-override-parser hook creates a state file that we read here
    let constraintOverride = toolParams._constraint_override || null;

    // Read override state from temporary file
    const overrideStateFile = join(tmpdir(), `constraint-override-${sessionId}.json`);

    if (existsSync(overrideStateFile)) {
      try {
        const stateData = readFileSync(overrideStateFile, 'utf8');
        const state = JSON.parse(stateData);

        // Check if state is still valid
        const now = Date.now();
        const isExpired = now > state.expiresAt || state.promptCount >= state.maxPrompts;

        if (isExpired) {
          // Clean up expired state
          unlinkSync(overrideStateFile);
        } else {
          // Use overrides from state
          constraintOverride = state.constraintIds;

          // Increment prompt count
          state.promptCount += 1;
          writeFileSync(overrideStateFile, JSON.stringify(state, null, 2));
        }
      } catch (error) {
        console.error('⚠️ Failed to read override state:', error.message);
      }
    }

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

    // Read active skills from skill state file
    let activeSkills = {};
    if (existsSync(skillStateFile)) {
      try {
        const skillState = JSON.parse(readFileSync(skillStateFile, 'utf8'));
        const now = Date.now();

        // Filter expired skills and collect active ones
        for (const [skillName, skillData] of Object.entries(skillState.skills || {})) {
          if (now < skillData.expiresAt) {
            activeSkills[skillName] = skillData;
          }
        }

        // Clean up expired skills
        if (Object.keys(activeSkills).length !== Object.keys(skillState.skills || {}).length) {
          writeFileSync(skillStateFile, JSON.stringify({ skills: activeSkills }, null, 2));
        }
      } catch (error) {
        console.error('⚠️ Failed to read skill state:', error.message);
      }
    }

    // Import and use the constraint enforcer
    const { preToolHook } = await import('./real-time-constraint-hook.js');

    const context = {
      timestamp: Date.now(),
      source: 'claude-code-tool-hook',
      workingDirectory: process.cwd(),
      sessionId: toolData.sessionId || 'unknown',
      toolName: toolCall.name,
      project: detectedProject,  // Add detected project to context
      constraintOverride: constraintOverride,  // Pass user-initiated override
      activeSkills: activeSkills  // Pass active skills to constraint checker
    };

    // Check constraints
    const result = await preToolHook(toolCall, context);

    if (result.continue) {
      // Tool allowed - exit silently with success (hooks MUST be silent on exit 0)
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