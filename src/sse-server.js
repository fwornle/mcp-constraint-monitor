#!/usr/bin/env node

/**
 * SSE-based MCP server for constraint-monitor
 *
 * This server runs as a single persistent process that multiple Claude Code sessions
 * can connect to via HTTP/SSE transport. Designed for containerized deployments.
 */

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { ConstraintEngine } from './engines/constraint-engine.js';
import { StatusGenerator } from './status/status-generator.js';
import { ConfigManager } from './utils/config-manager.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.CONSTRAINT_MONITOR_PORT || '3849', 10);

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION - Server will attempt to continue:', error);
});

process.on('unhandledRejection', (reason, _promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('UNHANDLED PROMISE REJECTION - Server will continue:', error);
});

// Shared instances for all sessions
let constraintEngine = null;
let statusGenerator = null;
const config = new ConfigManager();

async function ensureInitialized() {
  if (!constraintEngine) {
    logger.info('Initializing Constraint Monitor...');

    constraintEngine = new ConstraintEngine(config);
    statusGenerator = new StatusGenerator(config);

    await constraintEngine.initialize();
    await statusGenerator.initialize();

    logger.info('Constraint Monitor initialized successfully');
  }
}

// Tool handlers
async function getConstraintStatus(args) {
  await ensureInitialized();
  const status = await statusGenerator.generateStatus(args?.sessionId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'operational',
        compliance_score: status.compliance || 8.5,
        active_violations: status.violations || 0,
        risk_level: status.risk || 'low',
        last_updated: new Date().toISOString(),
        session_id: args?.sessionId || 'default'
      }, null, 2)
    }]
  };
}

async function checkConstraints(args) {
  await ensureInitialized();
  const results = await constraintEngine.checkConstraints({
    content: args.content,
    type: args.type,
    filePath: args.filePath
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        violations: results.violations || [],
        compliance_score: results.compliance || 10,
        suggestions: results.suggestions || [],
        risk_assessment: results.risk || 'low',
        checked_at: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function getViolationHistory(args) {
  await ensureInitialized();
  const history = await constraintEngine.getViolationHistory({
    limit: args?.limit || 10,
    sessionId: args?.sessionId
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        violations: history.violations || [],
        total_count: history.total || 0,
        session_metrics: history.metrics || {},
        retrieved_at: new Date().toISOString()
      }, null, 2)
    }]
  };
}

async function updateConstraints(args) {
  await ensureInitialized();
  const result = await constraintEngine.updateConstraints(args.constraints);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        updated_constraints: result.updated || [],
        active_constraints: result.active || 0,
        updated_at: new Date().toISOString(),
        message: 'Constraints updated successfully'
      }, null, 2)
    }]
  };
}

// Tool definitions
const TOOLS = [
  {
    name: 'get_constraint_status',
    description: 'Get current constraint monitoring status and compliance metrics',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID to get specific session metrics'
        }
      }
    }
  },
  {
    name: 'check_constraints',
    description: 'Check code or actions against defined constraints',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Code or content to check'
        },
        type: {
          type: 'string',
          enum: ['code', 'action', 'file'],
          description: 'Type of content being checked'
        },
        filePath: {
          type: 'string',
          description: 'Optional file path for context'
        }
      },
      required: ['content', 'type']
    }
  },
  {
    name: 'get_violation_history',
    description: 'Get history of constraint violations and their resolutions',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of violations to return',
          default: 10
        },
        sessionId: {
          type: 'string',
          description: 'Optional session ID to filter violations'
        }
      }
    }
  },
  {
    name: 'update_constraints',
    description: 'Update or add constraint rules',
    inputSchema: {
      type: 'object',
      properties: {
        constraints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              pattern: { type: 'string' },
              message: { type: 'string' },
              severity: {
                type: 'string',
                enum: ['info', 'warning', 'error', 'critical']
              },
              enabled: { type: 'boolean', default: true }
            },
            required: ['id', 'pattern', 'message']
          }
        }
      },
      required: ['constraints']
    }
  }
];

function createMcpServer() {
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_constraint_status':
          return await getConstraintStatus(args);

        case 'check_constraints':
          return await checkConstraints(args);

        case 'get_violation_history':
          return await getViolationHistory(args);

        case 'update_constraints':
          return await updateConstraints(args);

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool "${name}" not found`
          );
      }
    } catch (error) {
      logger.error('Tool execution error:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error.message}`
      );
    }
  });

  return server;
}

// Express app with SSE transport
const app = express();
app.use(express.json());

// Store transports by session ID
const transports = {};

// Store heartbeat intervals by session ID
const heartbeatIntervals = {};

// Heartbeat interval in milliseconds (15 seconds)
const HEARTBEAT_INTERVAL_MS = 15000;

// Server startup time for uptime tracking
const serverStartTime = Date.now();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'constraint-monitor',
    sessions: Object.keys(transports).length,
    activeHeartbeats: Object.keys(heartbeatIntervals).length,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    initialized: !!constraintEngine,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
  });
});

// SSE endpoint for establishing the stream
app.get('/sse', async (_req, res) => {
  logger.info('New SSE connection request');
  try {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    // Set up heartbeat to keep SSE connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        if (!res.writableEnded && !res.destroyed) {
          res.write(`:heartbeat ${Date.now()}\n\n`);
        } else {
          clearInterval(heartbeatInterval);
          delete heartbeatIntervals[sessionId];
        }
      } catch (error) {
        clearInterval(heartbeatInterval);
        delete heartbeatIntervals[sessionId];
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatIntervals[sessionId] = heartbeatInterval;

    transport.onclose = () => {
      logger.info(`SSE transport closed for session ${sessionId}`);
      if (heartbeatIntervals[sessionId]) {
        clearInterval(heartbeatIntervals[sessionId]);
        delete heartbeatIntervals[sessionId];
      }
      delete transports[sessionId];
    };

    res.on('close', () => {
      if (heartbeatIntervals[sessionId]) {
        clearInterval(heartbeatIntervals[sessionId]);
        delete heartbeatIntervals[sessionId];
      }
    });

    const server = createMcpServer();
    await server.connect(transport);
    logger.info(`Established SSE stream with session ID: ${sessionId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Error establishing SSE stream: ${errorMsg}`);
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

// Messages endpoint for receiving client JSON-RPC requests
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    res.status(400).send('Missing sessionId parameter');
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    logger.error(`No active transport found for session ID: ${sessionId}`);
    res.status(404).send('Session not found');
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Error handling request: ${errorMsg}`);
    if (!res.headersSent) {
      res.status(500).send('Error handling request');
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Constraint Monitor SSE Server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});

// Handle shutdown
async function shutdown() {
  console.log('Shutting down server...');
  for (const sessionId in heartbeatIntervals) {
    clearInterval(heartbeatIntervals[sessionId]);
    delete heartbeatIntervals[sessionId];
  }
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  console.log('Server shutdown complete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
