#!/usr/bin/env node

/**
 * Constraint Monitor Dashboard Server
 * HTTP server for serving the dashboard and providing API endpoints
 */

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import cors from 'cors';
import { ConfigManager } from './utils/config-manager.js';
import { StatusGenerator } from './status/status-generator.js';
import { ConstraintEngine } from './engines/constraint-engine.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class DashboardServer {
    constructor(port = 3001) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.config = new ConfigManager();
        this.statusGenerator = new StatusGenerator();
        this.constraintEngine = new ConstraintEngine();
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Enable CORS for all origins
        this.app.use(cors());
        
        // Parse JSON bodies
        this.app.use(express.json());
        
        // Serve static dashboard files
        const dashboardPath = join(__dirname, '../dashboard');
        this.app.use('/dashboard', express.static(dashboardPath));
        
        // Redirect root to dashboard
        this.app.get('/', (req, res) => {
            res.redirect('/dashboard');
        });

        // Logging middleware
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, { 
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });
    }

    setupRoutes() {
        // API Routes
        this.app.get('/api/status', this.handleGetStatus.bind(this));
        this.app.get('/api/constraints', this.handleGetConstraints.bind(this));
        this.app.get('/api/violations', this.handleGetViolations.bind(this));
        this.app.get('/api/activity', this.handleGetActivity.bind(this));
        this.app.get('/api/health', this.handleHealthCheck.bind(this));
        this.app.get('/api/projects', this.handleGetProjects.bind(this));
        
        // Constraint management
        this.app.post('/api/constraints/:id/toggle', this.handleToggleConstraint.bind(this));
        this.app.post('/api/violations/:id/resolve', this.handleResolveViolation.bind(this));
        
        // Error handling
        this.app.use(this.handleError.bind(this));
    }

    async handleGetStatus(req, res) {
        try {
            const status = await this.statusGenerator.generateStatus();
            
            res.json({
                status: 'success',
                data: {
                    compliance_score: status.compliance || 8.5,
                    active_violations: status.violations || 0,
                    trajectory: status.trajectory || 'exploring',
                    risk_level: status.risk || 'low',
                    interventions: status.interventions || 0,
                    healthy: status.healthy !== false,
                    last_updated: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error('Failed to get status', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve status',
                error: error.message
            });
        }
    }

    async handleGetConstraints(req, res) {
        try {
            // Check if grouped data is requested
            const includeGroups = req.query.grouped === 'true';
            
            if (includeGroups) {
                // Return grouped constraints with metadata
                const groupedData = this.config.getConstraintsWithGroups();
                const settings = this.config.getConstraintSettings();
                
                res.json({
                    status: 'success',
                    data: {
                        constraints: groupedData.groups.map(groupData => ({
                            group: groupData.group,
                            constraints: groupData.constraints.map(constraint => ({
                                id: constraint.id,
                                group: constraint.group,
                                pattern: constraint.pattern,
                                message: constraint.message,
                                severity: constraint.severity,
                                enabled: constraint.enabled !== false,
                                suggestion: constraint.suggestion || null
                            }))
                        })),
                        metadata: {
                            total_constraints: groupedData.total_constraints,
                            total_groups: groupedData.total_groups,
                            enabled_constraints: groupedData.enabled_constraints,
                            settings: settings
                        }
                    }
                });
            } else {
                // Return flat constraints list (legacy format)
                const constraints = this.config.getConstraints();
                
                res.json({
                    status: 'success',
                    data: constraints.map(constraint => ({
                        id: constraint.id,
                        group: constraint.group,
                        pattern: constraint.pattern,
                        message: constraint.message,
                        severity: constraint.severity,
                        enabled: constraint.enabled !== false,
                        suggestion: constraint.suggestion || null
                    }))
                });
            }
        } catch (error) {
            logger.error('Failed to get constraints', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve constraints',
                error: error.message
            });
        }
    }

    async handleGetViolations(req, res) {
        try {
            let violations = [];
            
            // Try to get enhanced live session violations
            try {
                const enhancedEndpointPath = join(__dirname, '../../../scripts/enhanced-constraint-endpoint.js');
                const enhancedEndpoint = await import(enhancedEndpointPath);
                
                const liveViolations = await enhancedEndpoint.getLiveSessionViolations();
                const history = await enhancedEndpoint.getEnhancedViolationHistory(20);
                
                // Transform violations for dashboard display
                violations = (history.violations || []).map(violation => ({
                    id: violation.id,
                    constraint_id: violation.constraint_id,
                    message: violation.message,
                    severity: violation.severity,
                    timestamp: violation.timestamp,
                    tool: violation.tool,
                    status: 'active',
                    source: 'live_session',
                    session_id: violation.sessionId,
                    context: violation.context
                }));
                
                // Add live session metadata
                const responseData = {
                    violations: violations,
                    live_session: {
                        active_count: liveViolations.active_session_count || 0,
                        compliance_score: liveViolations.session_compliance_score || 10.0,
                        trends: liveViolations.session_trends || 'stable',
                        most_recent: liveViolations.most_recent
                    },
                    statistics: {
                        total_count: history.total_count || 0,
                        severity_breakdown: history.severity_breakdown || {},
                        session_types: history.session_types || {}
                    }
                };
                
                res.json({
                    status: 'success',
                    data: responseData.violations,
                    meta: {
                        total: responseData.statistics.total_count,
                        live_session: responseData.live_session,
                        statistics: responseData.statistics,
                        source: 'enhanced_live_logging'
                    }
                });
                
            } catch (enhancedError) {
                logger.warn('Enhanced violations not available, using default', { error: enhancedError.message });
                
                // Fallback to empty violations
                res.json({
                    status: 'success',
                    data: violations,
                    meta: {
                        total: 0,
                        source: 'default',
                        warning: 'Enhanced live logging not available'
                    }
                });
            }
            
        } catch (error) {
            logger.error('Failed to get violations', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve violations',
                error: error.message
            });
        }
    }

    async handleGetActivity(req, res) {
        try {
            // Mock activity feed for now
            const activity = [
                {
                    time: 'Just now',
                    message: 'Dashboard accessed',
                    type: 'info',
                    timestamp: new Date().toISOString()
                },
                {
                    time: '2 minutes ago',
                    message: 'Constraint monitoring active',
                    type: 'info',
                    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
                },
                {
                    time: '5 minutes ago',
                    message: 'System status check completed',
                    type: 'success',
                    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
                }
            ];
            
            res.json({
                status: 'success',
                data: activity
            });
        } catch (error) {
            logger.error('Failed to get activity', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve activity',
                error: error.message
            });
        }
    }

    async handleHealthCheck(req, res) {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version,
                services: {
                    constraintEngine: 'operational',
                    statusGenerator: 'operational',
                    dashboard: 'operational'
                }
            };
            
            res.json({
                status: 'success',
                data: health
            });
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Health check failed',
                error: error.message
            });
        }
    }

    async handleGetProjects(req, res) {
        try {
            const lslRegistryPath = join(__dirname, '../../../.global-lsl-registry.json');
            let projects = [];
            let currentProject = null;

            try {
                const registryData = JSON.parse(readFileSync(lslRegistryPath, 'utf8'));
                
                // Get current project (where we're running from)
                const cwd = process.cwd();
                
                projects = Object.entries(registryData.projects || {}).map(([projectName, projectInfo]) => {
                    const isActive = projectInfo.status === 'active';
                    const isCurrent = cwd.includes(projectInfo.projectPath);
                    
                    if (isCurrent) {
                        currentProject = projectName;
                    }

                    return {
                        name: projectName,
                        path: projectInfo.projectPath,
                        status: projectInfo.status,
                        active: isActive,
                        current: isCurrent,
                        pid: projectInfo.monitorPid,
                        startTime: projectInfo.startTime,
                        lastHealthCheck: projectInfo.lastHealthCheck,
                        exchanges: projectInfo.exchanges || 0
                    };
                });
                
            } catch (error) {
                logger.warn('Could not read LSL registry, using fallback', { error: error.message });
                
                // Fallback: just return current project info
                const cwd = process.cwd();
                const projectName = cwd.split('/').pop();
                currentProject = projectName;
                
                projects = [{
                    name: projectName,
                    path: cwd,
                    status: 'active',
                    active: true,
                    current: true,
                    pid: process.pid,
                    startTime: Date.now(),
                    lastHealthCheck: Date.now(),
                    exchanges: 0
                }];
            }

            res.json({
                status: 'success',
                data: {
                    projects: projects,
                    currentProject: currentProject,
                    total: projects.length,
                    active: projects.filter(p => p.active).length
                }
            });
            
        } catch (error) {
            logger.error('Failed to get projects', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve projects',
                error: error.message
            });
        }
    }

    async handleToggleConstraint(req, res) {
        try {
            const { id } = req.params;
            const { enabled } = req.body;
            
            // For now, just acknowledge the request
            // In production, this would update the constraint configuration
            logger.info(`Toggling constraint ${id}`, { enabled });
            
            res.json({
                status: 'success',
                message: `Constraint ${id} ${enabled ? 'enabled' : 'disabled'}`,
                data: { id, enabled }
            });
        } catch (error) {
            logger.error('Failed to toggle constraint', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to toggle constraint',
                error: error.message
            });
        }
    }

    async handleResolveViolation(req, res) {
        try {
            const { id } = req.params;
            
            // For now, just acknowledge the request
            // In production, this would mark the violation as resolved
            logger.info(`Resolving violation ${id}`);
            
            res.json({
                status: 'success',
                message: `Violation ${id} resolved`,
                data: { id, resolved: true }
            });
        } catch (error) {
            logger.error('Failed to resolve violation', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to resolve violation',
                error: error.message
            });
        }
    }

    handleError(error, req, res, next) {
        logger.error('Dashboard server error', {
            error: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method
        });
        
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = createServer(this.app);
            
            this.server.listen(this.port, (error) => {
                if (error) {
                    logger.error('Failed to start dashboard server', { error: error.message, port: this.port });
                    reject(error);
                } else {
                    logger.info('Dashboard server started', { 
                        port: this.port,
                        dashboardUrl: `http://localhost:${this.port}/dashboard`,
                        apiUrl: `http://localhost:${this.port}/api`
                    });
                    resolve();
                }
            });
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('Dashboard server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getServerInfo() {
        return {
            port: this.port,
            dashboardUrl: `http://localhost:${this.port}/dashboard`,
            apiUrl: `http://localhost:${this.port}/api`,
            running: this.server && this.server.listening
        };
    }
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = parseInt(process.env.DASHBOARD_PORT) || 3001;
    const server = new DashboardServer(port);
    
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down dashboard server...`);
        await server.stop();
        process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Start server
    server.start().catch((error) => {
        logger.error('Failed to start dashboard server', { error: error.message });
        process.exit(1);
    });
}

export { DashboardServer };