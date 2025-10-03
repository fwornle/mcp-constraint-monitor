# Suggested Commands for MCP Constraint Monitor

## Development Commands
```bash
# Start the MCP server
npm start

# Start API server (port 3031)
PORT=3031 npm run api

# Start dashboard (port 3030)
npm run dashboard

# Run tests
npm test

# Setup project
npm run setup

# Demo mode
npm run demo
```

## Dashboard Development
```bash
cd dashboard
pnpm install
pnpm dev  # Development mode
```

## Data Management
```bash
# View violations count
jq 'length' data/violations.json

# View violations by severity
jq '[.[] | .severity] | group_by(.) | map({severity: .[0], count: length})' data/violations.json

# Check API health
curl http://localhost:3031/api/health

# View constraint status
curl http://localhost:3031/api/status
```

## Debugging
```bash
# Check service status
ps aux | grep constraint-monitor

# View logs
tail -f dashboard.log

# Check port usage
lsof -i :3030,3031
```