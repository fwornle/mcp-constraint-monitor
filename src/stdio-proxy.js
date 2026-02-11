#!/usr/bin/env node

/**
 * Stdio proxy that connects to the SSE server
 *
 * This is a lightweight proxy that Claude Code spawns (via stdio transport).
 * It connects to a shared SSE server, forwarding requests/responses.
 * This allows Claude to connect to containerized MCP servers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

const SSE_SERVER_URL = process.env.CONSTRAINT_MONITOR_SSE_URL || 'http://localhost:3849';
const PROXY_NAME = 'constraint-monitor';

// Persistent file logging for diagnostics
const LOG_DIR = process.env.CODING_REPO
  ? path.join(process.env.CODING_REPO, '.data', 'logs')
  : path.join(process.cwd(), '.data', 'logs');

try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const LOG_FILE = path.join(LOG_DIR, `mcp-proxy-${PROXY_NAME}.log`);

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} [${PROXY_NAME}-proxy] ${msg}\n`;
  console.error(line.trimEnd());
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// Keep process alive with a heartbeat interval
let heartbeatInterval = null;

async function startProxy() {
  log('info', `Starting proxy -> ${SSE_SERVER_URL}`);
  log('info', `Log file: ${LOG_FILE}`);

  // Connect to the SSE server as a client
  const sseTransport = new SSEClientTransport(new URL(`${SSE_SERVER_URL}/sse`));
  const client = new Client({
    name: 'constraint-monitor-proxy',
    version: '1.0.0',
  });

  // Handle SSE transport errors
  sseTransport.onerror = (error) => {
    log('error', `SSE transport error: ${error}`);
  };

  // Handle SSE transport close
  sseTransport.onclose = () => {
    log('warn', 'SSE transport closed unexpectedly');
  };

  try {
    await client.connect(sseTransport);
    log('info', `Connected to SSE server at ${SSE_SERVER_URL}`);
  } catch (error) {
    log('error', `Failed to connect to SSE server at ${SSE_SERVER_URL}: ${error}`);
    log('error', 'Make sure the Docker container is running and port is mapped: docker port coding-services 3849');
    process.exit(1);
  }

  // Start heartbeat to keep process alive
  heartbeatInterval = setInterval(() => {
    // This keeps the event loop active
  }, 30000);

  // Create stdio server for Claude Code
  const server = new Server(
    {
      name: 'constraint-monitor',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Forward all requests to the SSE server
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await client.listTools();
    return { tools: result.tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await client.callTool({
      name: request.params.name,
      arguments: request.params.arguments,
    });
    return result;
  });

  // Connect to stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle stdio transport close
  transport.onclose = () => {
    log('info', 'Stdio transport closed - Claude Code disconnected');
    cleanup();
  };

  // Cleanup function
  function cleanup() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    client.close().catch(() => {});
    process.exit(0);
  }

  // Handle cleanup signals
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Handle stdin close
  process.stdin.on('close', () => {
    log('info', 'stdin closed - exiting');
    cleanup();
  });

  // Keep process reference alive
  process.stdin.resume();
}

startProxy().catch((error) => {
  log('error', `Proxy startup failed: ${error}`);
  process.exit(1);
});
