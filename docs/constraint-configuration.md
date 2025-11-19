# Constraint Configuration Guide

This guide explains how to configure constraints in the MCP Constraint Monitor system.

## Table of Contents

- [Constraint File Locations](#constraint-file-locations)
- [Basic Constraint Structure](#basic-constraint-structure)
- [Constraint Properties](#constraint-properties)
- [Advanced Features](#advanced-features)
  - [applies_to Property](#applies_to-property)
  - [Semantic Validation](#semantic-validation)
  - [Exceptions and Whitelists](#exceptions-and-whitelists)

---

## Constraint File Locations

Constraints are defined in YAML files:

- **Global constraints**: `constraints.yaml` (repository-wide rules)
- **Project-specific constraints**: `.constraint-monitor.yaml` (overrides and additions)

The system loads both files and merges them, with project-specific constraints taking precedence.

---

## Basic Constraint Structure

```yaml
constraints:
  - id: unique-constraint-id
    group: category-name
    pattern: "regex-pattern-here"
    message: "Human-readable violation message"
    severity: critical|error|warning
    enabled: true
    suggestion: "How to fix this violation"
```

### Required Properties

- **id**: Unique identifier for the constraint
- **pattern**: Regular expression to match violations
- **message**: Description shown when constraint is violated
- **severity**: `critical`, `error`, or `warning`
- **enabled**: `true` or `false`

---

## Constraint Properties

### severity

Determines the impact level of violations:

- **critical**: Blocks execution immediately, requires immediate attention
- **error**: Serious violations that should be fixed soon
- **warning**: Advisory violations, execution continues

### group

Organizes constraints into logical categories:

- `architecture`: System design rules
- `code-quality`: Code style and best practices
- `security`: Security-related constraints
- `documentation`: Documentation requirements

### flags

Regex flags to apply to the pattern:

```yaml
- id: case-insensitive-check
  pattern: "forbidden.*text"
  flags: "i"  # Case-insensitive matching
```

---

## Advanced Features

### applies_to Property

**New Feature**: Control whether constraints check file paths or file content.

#### Use Cases

1. **Prevent editing specific directories** (without false positives in other files)
2. **Enforce file naming conventions** (check paths, not content)
3. **Block specific file types** (by extension or path pattern)

#### Configuration

```yaml
- id: knowledge-base-direct-manipulation
  group: architecture
  pattern: "(?:\\.data/knowledge-(?:export|graph)/|\\.data/knowledge-export/.*\\.json)"
  message: "CRITICAL: Knowledge base must only be manipulated through bin/ukb CLI"
  severity: critical
  enabled: true
  applies_to: file_path  # Only check file path, not content
  suggestion: "Use 'bin/ukb' CLI for all knowledge base operations"
```

#### Valid Values

- **`file_path`** (default if omitted: checks content): Check only the file path
- **Omitted or any other value**: Check file content (default behavior)

#### How It Works

When `applies_to: file_path` is set:

1. The constraint engine receives the file path from tool calls (Edit, Write, Read, etc.)
2. The regex pattern is matched against the **file path only**, not the file content
3. File content is completely ignored for this constraint

**Example: Preventing False Positives**

Without `applies_to: file_path`:
```yaml
# This would block editing .gitignore if it mentions .data/knowledge-export/
- id: knowledge-base-protection
  pattern: "\\.data/knowledge-export/"
  # Matches both file paths AND content mentioning the path
```

With `applies_to: file_path`:
```yaml
# This only blocks files IN .data/knowledge-export/, not files mentioning it
- id: knowledge-base-protection
  pattern: "\\.data/knowledge-export/"
  applies_to: file_path  # Only check the actual file path
```

#### Real-World Example

```yaml
constraints:
  # Block direct edits to knowledge base files
  - id: knowledge-base-direct-manipulation
    group: architecture
    pattern: "(?:\\.data/knowledge-(?:export|graph)/|\\.data/knowledge-export/.*\\.json)"
    message: "CRITICAL: Knowledge base must only be manipulated through bin/ukb CLI"
    severity: critical
    enabled: true
    applies_to: file_path  # Only check file path, not content
    suggestion: "Use 'bin/ukb' CLI for all knowledge base operations"

  # Block specific file extensions from being created
  - id: no-backup-files
    group: code-quality
    pattern: "\\.(bak|backup|old|tmp)$"
    message: "Backup files should not be committed"
    severity: warning
    enabled: true
    applies_to: file_path

  # Block editing files in vendor directories
  - id: no-vendor-edits
    group: architecture
    pattern: "/(vendor|node_modules|\.venv)/"
    message: "Do not edit dependency files directly"
    severity: error
    enabled: true
    applies_to: file_path
```

---

### Semantic Validation

Enable AI-powered validation to reduce false positives:

```yaml
- id: smart-constraint
  pattern: "console\\.log"
  semantic_validation: true  # Use LLM to verify matches
```

When enabled, regex matches are validated by an LLM to determine if they're actual violations or acceptable uses.

---

### Exceptions and Whitelists

Exclude specific files or paths from constraint checking:

#### Exceptions

```yaml
- id: no-console-log
  pattern: "console\\.log"
  exceptions:
    - path: "**/*.test.js"
      reason: "Console logs allowed in tests"
    - path: "scripts/debug-*.js"
      reason: "Debug scripts need console output"
```

#### Whitelists

```yaml
- id: strict-naming
  pattern: "[A-Z_]+"
  whitelist:
    - "src/legacy/**"
    - "external/**"
```

---

## Pattern Matching Tips

### File Path Patterns

When using `applies_to: file_path`, write patterns that match file paths:

```yaml
# Match files in specific directories
pattern: "/restricted-dir/"

# Match file extensions
pattern: "\\.env(\\..*)?$"

# Match multiple locations
pattern: "(?:\\.data/secrets/|\\.config/private/)"

# Match anywhere in path
pattern: "node_modules"
```

### Content Patterns

When checking content (default behavior), write patterns for code:

```yaml
# Find function calls
pattern: "dangerousFunction\\s*\\("

# Find SQL injection risks
pattern: "SELECT.*\\+.*FROM"

# Find hardcoded secrets
pattern: "(password|api_key)\\s*=\\s*['\"][^'\"]+['\"]"
```

---

## Testing Constraints

After adding or modifying constraints:

1. **Restart the constraint monitor**:
   ```bash
   pkill -f "global-service-coordinator"
   node scripts/global-service-coordinator.js --daemon
   ```

2. **Test with actual file operations**:
   - Try editing a file that should be blocked
   - Verify the constraint message appears
   - Verify files that should pass are not blocked

3. **Check the dashboard**:
   - Visit http://localhost:3030
   - View violation history
   - Monitor real-time constraint checks

---

## Troubleshooting

### Constraint not firing

1. Check `enabled: true` in configuration
2. Verify the pattern regex is correct
3. For `applies_to: file_path`, ensure pattern matches file paths not content
4. Check exceptions/whitelists aren't excluding the file
5. Restart the constraint monitor to reload configuration

### False positives

1. Add `applies_to: file_path` if checking paths not content
2. Add exceptions for specific files
3. Enable `semantic_validation: true` for smarter detection
4. Refine the regex pattern to be more specific

### Pattern not matching

1. Test regex pattern in a regex tester
2. Remember to escape special characters: `.` `(` `)` `[` `]` `{` `}` etc.
3. For file paths, test against actual file path strings
4. Check if flags (like `i` for case-insensitive) are needed

---

## Best Practices

1. **Use descriptive IDs**: `knowledge-base-protection` not `constraint-1`
2. **Provide clear messages**: Explain what's wrong and why
3. **Include suggestions**: Tell users how to fix the violation
4. **Use applies_to wisely**: Path-only checks for file location rules
5. **Test thoroughly**: Ensure no false positives or negatives
6. **Document exceptions**: Explain why certain paths are whitelisted
7. **Group related constraints**: Use consistent group names
8. **Start with warnings**: Test new constraints before making them critical

---

## Migration Guide

### Updating Existing Constraints

If you have constraints that check file paths but are triggering false positives:

**Before:**
```yaml
- id: my-constraint
  pattern: "/protected/"
  # Matches both file paths AND file content
```

**After:**
```yaml
- id: my-constraint
  pattern: "/protected/"
  applies_to: file_path  # Only match file paths
```

### No Breaking Changes

The `applies_to` property is optional and defaults to content checking. Existing constraints without `applies_to` will continue to work exactly as before.

---

## Examples

See `.constraint-monitor.yaml` for real-world examples of:
- Path-based constraints with `applies_to: file_path`
- Content-based constraints with regex patterns
- Semantic validation for reduced false positives
- Exception and whitelist configurations
