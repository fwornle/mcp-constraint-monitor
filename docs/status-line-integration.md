# Status Line Integration

The MCP Constraint Monitor integrates seamlessly with Claude Code's status line to provide real-time feedback about your coding environment health and constraint compliance.

## Status Line Format

The constraint monitor displays information in this format:

```
🛡️ 8.5 🔍EX ⚠️2
```

## Icon Reference

### 🛡️ Compliance Score

**Icon**: 🛡️ (Shield)  
**Meaning**: Constraint monitoring and compliance protection

**Status Indicators:**
- **🛡️8.5** - Compliance score (0-10 scale)
- **🛡️⚠️** - Some violations detected (yellow)
- **🛡️❌** - Constraint monitor offline (red)

**Score Ranges:**
- **9.0+** - Excellent compliance 🟢
- **7.0-8.9** - Good compliance 🔵
- **5.0-6.9** - Warning compliance 🟡
- **<5.0** - Poor compliance 🔴

### 🔍 Trajectory Status

**Purpose**: Shows your current development activity pattern

**Icons & Meanings:**
- **🔍 EX** - **Exploring**: Researching, understanding, analyzing
- **📈 ON** - **On Track**: Focused implementation work
- **📉 OFF** - **Off Track**: Diverged from planned work
- **⚙️ IMP** - **Implementing**: Active coding/building
- **✅ VER** - **Verifying**: Testing, validation, review
- **🚫 BLK** - **Blocked**: Stuck, waiting, dependencies

### ⚠️ Violation Count

**Format**: ⚠️N (where N is the number of active violations)

**Meanings:**
- **No violations** - Icon not shown
- **⚠️1-5** - Minor violations (yellow)
- **⚠️6+** - Multiple violations (red)

## Example Status Lines

### All Systems Operational
```
🛡️ 9.2 📈ON 
```
- Excellent compliance (9.2/10)
- On track with focused work
- No active violations

### Warning State
```
🛡️ 6.8 🔍EX ⚠️3
```
- Low compliance (6.8/10) needs attention
- Exploring/researching phase
- 3 active violations

### Critical Issues
```
🛡️ ❌ 🚫BLK ⚠️8
```
- Constraint monitor offline
- Work is blocked
- 8 active violations

## Color Coding

The entire status line uses color coding:

- **🟢 Green**: All systems healthy, good compliance
- **🟡 Yellow**: Some degradation or warnings
- **🔴 Red**: Critical issues or poor compliance

## Configuration

Configure the status line in Claude Code:

### Global Configuration
`~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "mcp-constraint-monitor --status-line"
  }
}
```

### Project Configuration
`.claude/settings.local.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx mcp-constraint-monitor --status-line"
  }
}
```

## Troubleshooting

**No Status Line Appears:**
1. Verify MCP server is running: `mcp-constraint-monitor --status`
2. Check Claude Code MCP configuration
3. Ensure status line is configured in settings

**Status Shows Red/Offline:**
1. Check if constraint monitor is running
2. Verify database connections
3. Check logs: `mcp-constraint-monitor --logs`

**Inaccurate Scores:**
1. Review constraint configuration
2. Check recent violations: `mcp-constraint-monitor --violations`
3. Reset scoring: `mcp-constraint-monitor --reset-score`

## Customization

### Custom Icons

You can customize status line icons by modifying the configuration:

```yaml
# constraints.yaml
statusLine:
  icons:
    shield: "🛡️"
    exploring: "🔍"
    onTrack: "📈"
    violations: "⚠️"
  colors:
    excellent: "green"
    good: "cyan"
    warning: "yellow"
    critical: "red"
```

### Update Frequency

Control how often the status line updates:

```yaml
statusLine:
  updateInterval: 1000  # milliseconds
  realTimeUpdates: true
```

---

The status line provides immediate visual feedback about your coding environment health, helping you maintain high code quality and stay aligned with project constraints.