# MCP Constraint Monitor

Real-time constraint enforcement system for Claude Code that prevents policy violations before they happen.

## Overview

The MCP Constraint Monitor provides:

- **Real-time validation**: Checks constraints before tool execution
- **Flexible rules**: Regex patterns with optional semantic validation
- **Low latency**: 1-5ms for regex checks, 50-200ms with semantic validation
- **Dashboard**: Web UI for monitoring violations and compliance
- **File path vs content checking**: Control whether constraints check paths or content

## Quick Start

### Installation

```bash
cd integrations/mcp-constraint-monitor
npm install
./install.sh
```

### Basic Usage

1. **Define constraints** in `.constraint-monitor.yaml`:

```yaml
constraints:
  - id: my-constraint
    pattern: "forbidden-pattern"
    message: "This pattern is not allowed"
    severity: error
    enabled: true
```

2. **Start the monitor**:

```bash
node scripts/global-service-coordinator.js --daemon
```

3. **View dashboard**: http://localhost:3030

## Documentation

### Core Documentation

- **[Constraint Configuration Guide](docs/constraint-configuration.md)** ⭐ **START HERE**
  - Basic constraint structure
  - All constraint properties (`applies_to`, `severity`, `flags`, etc.)
  - Pattern matching tips
  - Real-world examples
  - Best practices and troubleshooting

### Advanced Features

- **[Semantic Constraint Detection](docs/semantic-constraint-detection.md)**
  - AI-powered validation to reduce false positives
  - LLM integration (Groq, Anthropic, Gemini)
  - Performance benchmarks and caching

- **[Semantic Detection Design](docs/semantic-detection-design.md)**
  - Architecture and design decisions
  - System diagrams
  - Implementation details

### Integration

- **[Claude Code Hook Format](docs/CLAUDE-CODE-HOOK-FORMAT.md)**
  - Hook data structure
  - Tool call interception
  - Integration patterns

- **[Status Line Integration](docs/status-line-integration.md)**
  - Real-time status display
  - Configuration options

## Key Features

### File Path vs Content Checking

NEW: Use `applies_to: file_path` to check file paths instead of content:

```yaml
- id: knowledge-base-protection
  pattern: "\\.data/knowledge-export/"
  applies_to: file_path  # Only blocks files IN this path
  message: "Use bin/ukb CLI to modify knowledge base"
```

This prevents false positives when file content mentions protected paths.

### Semantic Validation

Reduce false positives with AI-powered validation:

```yaml
- id: smart-constraint
  pattern: "console\\.log"
  semantic_validation: true  # LLM verifies if it's a real violation
```

### Exceptions and Whitelists

Exclude specific files from constraint checking:

```yaml
- id: my-constraint
  pattern: "strict-rule"
  exceptions:
    - path: "**/*.test.js"
      reason: "Tests are exempt"
```

## Architecture

```
Claude Code Tool Call
        ↓
Pre-Tool Hook (Node.js)
        ↓
Constraint Engine
        ↓
[Regex Check] → [Semantic Validation (optional)]
        ↓
Block or Allow
```

## Configuration Files

- **`.constraint-monitor.yaml`**: Project-specific constraints (primary)
- **`constraints.yaml`**: Global constraints (repository-wide)
- **`config/enforcement.json`**: Enforcement settings
- **`.env.ports`**: Port configuration

## Dashboard

Access the web dashboard at http://localhost:3030 to:

- View real-time constraint violations
- Monitor compliance scores
- Analyze violation trends
- Test constraint patterns
- Manage enforcement settings

## Development

### Running Tests

```bash
npm test
```

### Debugging

Enable debug logging:

```bash
export LOG_LEVEL=debug
node src/dashboard-server.js
```

### Adding New Constraints

1. Edit `.constraint-monitor.yaml`
2. Restart the monitor: `pkill -f global-service-coordinator && node scripts/global-service-coordinator.js --daemon`
3. Test with actual file operations
4. Monitor dashboard for violations

## Troubleshooting

### Constraint not firing

1. Check `enabled: true` in configuration
2. Verify pattern regex is correct
3. For `applies_to: file_path`, ensure pattern matches paths not content
4. Restart the constraint monitor

### False positives

1. Add `applies_to: file_path` if checking paths
2. Enable `semantic_validation: true`
3. Add exceptions for specific files
4. Refine regex pattern

See the [Constraint Configuration Guide](docs/constraint-configuration.md) for detailed troubleshooting.

## Performance

- **Regex checking**: 1-5ms per constraint
- **Semantic validation**: 50-200ms with caching
- **Dashboard**: Real-time updates via WebSocket
- **Memory**: ~50MB base + caching overhead

## Contributing

When adding features:

1. Update relevant documentation
2. Add tests for new functionality
3. Update configuration examples
4. Test with real-world scenarios

## License

Part of the coding infrastructure project.

## Support

- **Documentation**: See `docs/` directory
- **Issues**: Create an issue in the main repository
- **Dashboard**: http://localhost:3030 for monitoring
