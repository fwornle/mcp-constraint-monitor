#!/usr/bin/env node

/**
 * MCP Constraint Monitor Server
 * 
 * Universal MCP server for real-time coding constraint monitoring and live guardrails.
 * Can be added to any Claude Code project for automated compliance checking.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

class ConstraintMonitorServer {
  constructor() {
    this.server = new Server(
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

    this.config = new ConfigManager();
    this.constraintEngine = null;
    this.statusGenerator = null;

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        await this.ensureInitialized();

        switch (name) {
          case 'get_constraint_status':
            return await this.getConstraintStatus(args);
          
          case 'check_constraints':
            return await this.checkConstraints(args);
          
          case 'get_violation_history':
            return await this.getViolationHistory(args);
          
          case 'update_constraints':
            return await this.updateConstraints(args);
          
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
  }

  async ensureInitialized() {
    if (!this.constraintEngine) {
      logger.info('Initializing Constraint Monitor...');
      
      this.constraintEngine = new ConstraintEngine(this.config);
      this.statusGenerator = new StatusGenerator(this.config);
      
      await this.constraintEngine.initialize();
      await this.statusGenerator.initialize();
      
      logger.info('Constraint Monitor initialized successfully');
    }
  }

  async getConstraintStatus(args) {
    const status = await this.statusGenerator.generateStatus(args.sessionId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'operational',
          compliance_score: status.compliance || 8.5,
          active_violations: status.violations || 0,
          trajectory: status.trajectory || 'exploring',
          risk_level: status.risk || 'low',
          last_updated: new Date().toISOString(),
          session_id: args.sessionId || 'default'
        }, null, 2)
      }]
    };
  }

  async checkConstraints(args) {
    const results = await this.constraintEngine.checkConstraints({
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

  async getViolationHistory(args) {
    const history = await this.constraintEngine.getViolationHistory({
      limit: args.limit || 10,
      sessionId: args.sessionId
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

  async updateConstraints(args) {
    const result = await this.constraintEngine.updateConstraints(args.constraints);

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

  async run() {
    const transport = new StdioServerTransport();

    // Handle stdin lifecycle events for graceful connection handling
    process.stdin.on('end', () => {
      logger.info('stdin ended - connection closing');
    });

    process.stdin.on('close', () => {
      logger.info('stdin closed - exiting gracefully');
      process.exit(0);
    });

    // Handle stdout errors (broken pipe when parent closes)
    process.stdout.on('error', (err) => {
      if (err.code === 'EPIPE') {
        logger.info('stdout pipe closed - exiting gracefully');
        process.exit(0);
      } else {
        logger.error('stdout error:', err);
      }
    });

    // Handle transport lifecycle
    transport.onclose = () => {
      logger.info('Transport closed');
    };

    transport.onerror = (err) => {
      logger.error('Transport error:', err);
    };

    await this.server.connect(transport);
    logger.info('Constraint Monitor MCP Server running on stdio');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down Constraint Monitor MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down Constraint Monitor MCP Server...');
  process.exit(0);
});

// Start server
const server = new ConstraintMonitorServer();
server.run().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { ConstraintMonitorServer };