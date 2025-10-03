# MCP Constraint Monitor Project Overview

## Purpose
Universal MCP server for real-time coding constraint monitoring and live guardrails. Provides intelligent code quality monitoring with zero configuration for Claude Code projects.

## Tech Stack
- **Backend**: Node.js with Express.js (dashboard server)
- **Frontend**: Next.js 15 with React 19, TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS
- **Data Storage**: SQLite (main), JSON files (violations), Optional: Qdrant (vector), Redis (analytics)
- **Charts**: Recharts library
- **Package Manager**: npm (backend), pnpm (dashboard)

## Key Features
- Real-time constraint violation detection (<5ms)
- Web dashboard with compliance tracking
- Chart visualization of violation timelines
- Live status line integration
- Hook-based prevention system
- Multi-project support via LSL registry

## Architecture
- **MCP Server**: `src/server.js` - Main constraint monitoring server
- **Dashboard Server**: `src/dashboard-server.js` - HTTP API server (port 3031)
- **Dashboard Frontend**: `dashboard/` - Next.js application (port 3030)
- **Configuration**: `constraints.yaml` - Constraint rules and groups
- **Data Storage**: `data/violations.json` - Violation persistence