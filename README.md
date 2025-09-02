# MCP Constraint Monitor

🛡️ **Universal MCP server for real-time coding constraint monitoring and live guardrails**

[![npm version](https://badge.fury.io/js/mcp-constraint-monitor.svg)](https://badge.fury.io/js/mcp-constraint-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code Compatible](https://img.shields.io/badge/Claude%20Code-Compatible-blue.svg)](https://claude.ai/code)

Add intelligent code quality monitoring to any Claude Code project with zero configuration. The constraint monitor provides real-time violation detection, compliance scoring, and live guardrails that keep your coding on track.

---

## 🎯 Features

- **🛡️ Live Guardrails**: Real-time constraint violation detection
- **📊 Compliance Scoring**: Automated code quality assessment
- **🌐 Web Dashboard**: Comprehensive constraint management interface
- **🔍 Pattern Detection**: Configurable rules for code patterns
- **⚡ Ultra-Fast**: Sub-10ms constraint checking
- **🧠 AI-Powered**: Optional semantic analysis with Groq
- **📈 Enhanced Status Line**: Rich tooltips with visual progress bars
- **🔧 Zero Config**: Works out of the box with sensible defaults
- **🌐 Universal**: Works with any Claude Code project

---

## 🚀 Quick Start

### Installation

```bash
# Via npm (recommended)
npm install -g mcp-constraint-monitor

# Or use npx (no installation)
npx mcp-constraint-monitor
```

### Add to Claude Code

Add to your `~/.claude/mcp.json` or project's `.mcp.json`:

```json
{
  "mcpServers": {
    "constraint-monitor": {
      "command": "npx",
      "args": ["mcp-constraint-monitor"]
    }
  }
}
```

### Start Monitoring

```bash
# In your project directory
mcp-constraint-monitor
```

**That's it!** The constraint monitor will:
- ✅ Create default configuration
- ✅ Initialize local databases  
- ✅ Start monitoring your code
- ✅ Display status in Claude Code

---

## 📋 MCP Tools

The server exposes these tools for Claude Code:

| Tool | Description |
|------|-------------|
| `get_constraint_status` | Get current monitoring status and compliance metrics |
| `check_action_constraints` | Check code against defined constraints |
| `get_violation_history` | Retrieve historical violations and trends |
| `add_constraint_rule` | Modify or add constraint rules |

---

## 🛡️ Status Line & Dashboard Integration

### Enhanced Status Line

The constraint monitor provides rich status line integration with enhanced tooltips:

```
🛡️ 8.5 🔍EX
```

**Hover Tooltip:**
```
🛡️ Constraint Monitor Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Compliance: 8.5/10.0
   █████████████░░ (Good)
✅ Status: No active violations
🔍 Activity: Exploring
🟢 Risk Level: Low
🔧 Interventions: 0
🟢 System: Operational

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖱️  Click to open dashboard
🔄 Updates every 5 seconds
```

**Status Elements:**
- **🛡️ 8.5** - Compliance score (0-10)
- **🔍EX** - Current trajectory (Exploring, On Track, Implementing, etc.)
- **Click Action** - Opens web dashboard

**Status Colors:**
- 🟢 Green: Excellent compliance (9.0+)
- 🔵 Cyan: Good compliance (7.0-8.9)  
- 🟡 Yellow: Warning compliance (5.0-6.9)
- 🔴 Red: Critical violations or offline

### Web Dashboard

Access the comprehensive web dashboard at `http://localhost:3001/dashboard`

**Dashboard Features:**
- **📊 Real-time Metrics**: Live compliance scoring and violation tracking
- **📋 Constraint Management**: View and manage all constraint rules
- **⚡ Activity Feed**: Real-time system activity and events
- **📱 Responsive Design**: Works on desktop and mobile devices
- **🌙 Dark/Light Mode**: Automatic theme detection

**Quick Access:**
```bash
# Launch dashboard and open browser
./bin/dashboard

# Custom port
./bin/dashboard --port=8080

# Server only (no browser)
./bin/dashboard --standalone
```

**API Endpoints:**
- `GET /api/health` - System health and uptime
- `GET /api/status` - Current compliance metrics  
- `GET /api/constraints` - All constraint rules
- `GET /api/violations` - Active violation history
- `GET /api/activity` - Real-time event feed

---

## ⚙️ Configuration

### Default Constraints

The monitor comes with sensible defaults:

```yaml
constraints:
  - id: no-console-log
    pattern: "console\\.log"
    message: "Use Logger.log() instead of console.log"
    severity: warning
    
  - id: no-var-declarations  
    pattern: "\\bvar\\s+"
    message: "Use 'let' or 'const' instead of 'var'"
    severity: warning
    
  - id: no-hardcoded-secrets
    pattern: "(api[_-]?key|password|secret)\\s*[=:]\\s*['\"][^'\"]{8,}['\"]"
    message: "Potential hardcoded secret detected"
    severity: critical
```

### Project-Specific Rules

Create `constraints.yaml` in your project:

```yaml
constraints:
  # Your project-specific rules
  - id: react-hooks-deps
    pattern: "useEffect\\([^,]*,\\s*\\[\\]"
    message: "Verify useEffect dependencies"
    severity: info
    enabled: true

  # Framework-specific patterns
  - id: redux-direct-mutation
    pattern: "state\\.[\\w.]+\\s*="
    message: "Direct state mutation - use Redux patterns"
    severity: error
```

### Environment Variables

Optional configuration via environment:

```bash
export GROQ_API_KEY="your-key"          # Enable AI analysis
export QDRANT_HOST="localhost"          # Vector database
export ANALYTICS_DB_PATH="./data.db"    # Persistent analytics
```

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude Code   │◄──►│ MCP Constraint   │◄──►│   Databases     │
│                 │    │    Monitor       │    │                 │
│ • Status Line   │    │                  │    │ • SQLite        │
│ • Tool Calls    │    │ • Pattern Check  │    │ • Qdrant (opt)  │
│ • Real-time     │    │ • Compliance     │    │ • Redis (opt)   │
└─────────────────┘    │ • AI Analysis    │    └─────────────────┘
                       └──────────────────┘
```

### Performance Targets

| Component | Target Latency | Technology |
|-----------|----------------|------------|
| Conversation Capture | Real-time (0ms) | Hook-based |
| Pattern Matching | <1ms | Regex engine |
| Vector Search | <3ms | Qdrant + quantization |
| Semantic Analysis | <50ms | Groq inference |
| **Total Intervention** | **<10ms** | **End-to-end** |

---

## 🔧 Development

### Local Setup

```bash
git clone https://github.com/fwornle/mcp-constraint-monitor
cd mcp-constraint-monitor
npm install
npm run setup
```

### Testing

```bash
npm test                    # Run tests
npm run start              # Start server
npm run dev                # Development mode
./bin/demo                 # Complete system demo
```

### Custom Engines

Add custom analysis engines:

```javascript
import { ConstraintEngine } from 'mcp-constraint-monitor';

class CustomEngine extends ConstraintEngine {
  async checkCustomPattern(code) {
    // Your custom logic
  }
}
```

---

## 📚 Examples

### React Project
```yaml
constraints:
  - id: react-memo
    pattern: "export default function\\s+\\w+.*\\{[^}]*useState"
    message: "Consider React.memo for components with complex state"
    severity: info
```

### Node.js API
```yaml  
constraints:
  - id: async-error-handling
    pattern: "app\\.(get|post|put|delete).*async.*\\{(?![^}]*catch)"
    message: "Async routes should have error handling"
    severity: error
```

### Security-Focused
```yaml
constraints:
  - id: sql-injection
    pattern: "\\$\\{[^}]*\\}.*SELECT|INSERT.*\\$\\{[^}]*\\}"
    message: "Potential SQL injection - use parameterized queries"
    severity: critical
```

---

## 🔒 Advanced Features

### Real-Time Semantic Analysis

- **Sub-50ms Analysis**: Groq's mixtral-8x7b model delivers 1000+ tokens/sec
- **Trajectory Thinking**: Evaluates accumulated intent vs individual actions
- **Context Persistence**: Maintains constraint state across conversation auto-compaction
- **Multi-Step Workflow Recognition**: Distinguishes exploration from violation

### Predictive Risk Assessment

The system learns from violation patterns to predict and prevent issues:

```javascript
// Risk assessment before action execution
{
  "riskScore": 0.85,
  "reason": "Similar pattern led to violations in 3 recent sessions", 
  "alternatives": [
    "Read configuration files first",
    "Check user constraints in previous messages"
  ]
}
```

### Database Options

**Basic Mode (SQLite only)**:
- Fast constraint checking
- Violation history
- Local analytics

**Enhanced Mode (with Docker)**:
- Vector similarity search (Qdrant)
- Advanced analytics (Redis)
- Semantic analysis
- Pattern learning

---

## 📊 API Reference

### MCP Tools

```javascript
// Check constraint status
mcp__constraint_monitor__get_constraint_status()

// Check specific code
mcp__constraint_monitor__check_action_constraints({
  action: { type: "code", content: "console.log('test')" }
})

// Add custom constraint
mcp__constraint_monitor__add_constraint_rule({
  id: "custom-rule",
  type: "pattern", 
  matcher: "TODO:",
  message: "No TODO comments in production code"
})

// Get violation history
mcp__constraint_monitor__get_violation_history({ limit: 10 })
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Add tests for new functionality  
4. Submit pull request

### Development Workflow

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🆘 Support

- 📖 [Documentation](https://github.com/fwornle/mcp-constraint-monitor/docs)
- 🐛 [Issues](https://github.com/fwornle/mcp-constraint-monitor/issues)
- 💬 [Discussions](https://github.com/fwornle/mcp-constraint-monitor/discussions)

---

**Built for the Claude Code ecosystem - Add intelligence to your coding workflow** 🚀

### Why Use MCP Constraint Monitor?

**For Individual Developers:**
- Catch coding mistakes before they become bugs
- Learn better coding patterns through real-time feedback
- Maintain consistent code quality across projects

**For Teams:**
- Enforce shared coding standards automatically
- Reduce code review time with automated checks
- Share constraint configurations across team members

**For Projects:**
- Zero-configuration setup works immediately
- Scales from simple scripts to complex applications
- Integrates with existing development workflows

**Get started in under 30 seconds** - just add the MCP server to your configuration and start coding with intelligent guardrails!