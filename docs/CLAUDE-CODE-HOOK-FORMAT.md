# Claude Code Hook Data Format

**Last Updated**: 2025-10-11
**Applies To**: Claude Code CLI PreToolUse and PostToolUse hooks

---

## Overview

Claude Code passes hook data to external scripts via **stdin** as a JSON object. Understanding this format is critical for proper hook integration.

---

## Hook Data Structure

### Complete Format

```json
{
  "session_id": "0bb251e4-7cbf-4ef0-ab80-2390c91ba813",
  "transcript_path": "/Users/username/.claude/projects/-Users-...",
  "cwd": "/path/to/working/directory",
  "permission_mode": "acceptEdits",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.js",
    "content": "file contents...",
    "old_string": "...",
    "new_string": "..."
  }
}
```

---

## Field Descriptions

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique identifier for the current Claude session |
| `transcript_path` | string | Path to the JSONL transcript file for this session |
| `cwd` | string | Current working directory where Claude is running |
| `permission_mode` | string | Permission mode (e.g., "acceptEdits", "prompt") |
| `hook_event_name` | string | Name of the hook event ("PreToolUse" or "PostToolUse") |
| `tool_name` | string | Name of the tool being called |
| `tool_input` | object | **The tool's parameters/arguments** |

---

## Critical: Tool Parameters

### ⚠️ IMPORTANT: Use `tool_input`, NOT `parameters`

Claude Code passes tool parameters in the **`tool_input`** field.

**Common Mistake**:
```javascript
// ❌ WRONG - These fields don't exist
const params = hookData.parameters;  // undefined
const params = hookData.arguments;   // undefined
const params = hookData.args;        // undefined
```

**Correct**:
```javascript
// ✅ CORRECT
const params = hookData.tool_input;  // { file_path: "...", content: "..." }
```

---

## Tool-Specific Parameters

### Write Tool

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.js",
    "content": "// File contents\nconst x = 1;"
  }
}
```

### Edit Tool

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.js",
    "old_string": "const x = 1;",
    "new_string": "const x = 2;",
    "replace_all": false
  }
}
```

### Read Tool

```json
{
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/path/to/file.js",
    "offset": 0,
    "limit": 100
  }
}
```

### Bash Tool

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "ls -la",
    "description": "List files",
    "timeout": 120000
  }
}
```

---

## Stdin Reading

### Reading Hook Data

Hook scripts receive data via **stdin**. Proper reading:

```javascript
#!/usr/bin/env node

async function processHook() {
  try {
    let hookData = '';

    // Check if stdin is available (not a TTY)
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
      // No data - allow continuation
      process.exit(0);
    }

    // Parse JSON
    const toolData = JSON.parse(hookData);

    // Extract tool info
    const toolName = toolData.tool_name;
    const toolParams = toolData.tool_input;  // ← Key field!

    // Process...
  } catch (error) {
    console.error('Hook error:', error.message);
    process.exit(0);  // Fail open
  }
}

processHook();
```

---

## Exit Codes

Hook scripts communicate with Claude via **exit codes**:

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success - allow tool execution to proceed |
| `1` | Block - prevent tool execution |
| Other | Treated as error - behavior may vary |

### Blocking Execution

```javascript
// Block the tool
console.error('🚫 CONSTRAINT VIOLATION');
process.exit(1);
```

### Allowing Execution

```javascript
// Allow the tool
console.log('✅ Passed checks');
process.exit(0);
```

---

## Complete Example

```javascript
#!/usr/bin/env node

async function constraintHook() {
  try {
    // Read stdin
    let hookData = '';
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
      process.exit(0);  // No data, allow
    }

    // Parse hook data
    const toolData = JSON.parse(hookData);

    // Extract tool call info
    const toolName = toolData.tool_name;
    const toolParams = toolData.tool_input;  // ← Critical!

    // For Write/Edit tools, check content
    if (['Write', 'Edit'].includes(toolName)) {
      const content = toolParams.content || toolParams.new_string || '';

      // Check for violations
      if (content.includes('console.log')) {
        console.error('🚫 VIOLATION: Use Logger.log() instead of console.log');
        process.exit(1);  // Block
      }
    }

    // Allow execution
    console.log(`✅ ${toolName} passed checks`);
    process.exit(0);

  } catch (error) {
    // Fail open on errors
    console.error('⚠️ Hook error:', error.message);
    process.exit(0);
  }
}

constraintHook();
```

---

## Debugging

### Logging Hook Data

For debugging, log the complete hook data:

```javascript
const fs = require('fs');

// Log to a debug file
const debugLog = '/tmp/hook-debug.log';
const timestamp = new Date().toISOString();
fs.appendFileSync(debugLog,
  `[${timestamp}] ${JSON.stringify(toolData, null, 2)}\n\n`
);
```

### Common Issues

1. **Empty Parameters**: Check you're reading `tool_input`, not `parameters`
2. **No stdin**: Verify `process.stdin.isTTY !== true` before reading
3. **JSON Parse Errors**: Ensure complete stdin reading before parsing
4. **Blocking Unintentionally**: Check exit codes (0 = allow, 1 = block)

---

## Version Compatibility

This format is accurate as of:
- **Claude Code CLI**: Latest version (October 2025)
- **Hook Version**: PreToolUse/PostToolUse hooks

**Note**: Format may change in future Claude Code versions. Always verify with latest Claude Code documentation.

---

## References

- Claude Code Documentation: https://docs.claude.com/claude-code
- Hook Configuration: `~/.claude/settings.json`
- Example Implementation: `/integrations/mcp-constraint-monitor/src/hooks/pre-tool-hook-wrapper.js`

---

## Summary Checklist

✅ Read from **stdin**, not arguments
✅ Use **`tool_input`** for parameters, not `parameters`/`arguments`/`args`
✅ Parse as **JSON**
✅ Exit **0** to allow, **1** to block
✅ Handle errors gracefully (fail open)
✅ Test with actual Claude Code sessions, not simulations

---

*"The field is `tool_input`, not `parameters`. This matters."*
