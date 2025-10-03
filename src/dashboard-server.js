#!/usr/bin/env node

/**
 * Constraint Monitor Dashboard Server
 * HTTP server for serving the dashboard and providing API endpoints
 */

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import cors from 'cors';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { ConfigManager } from './utils/config-manager.js';
import { StatusGenerator } from './status/status-generator.js';
import { ConstraintEngine } from './engines/constraint-engine.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load port configuration from centralized .env.ports file
 */
function loadPortConfiguration() {
    const portsFilePath = join(__dirname, '../../../.env.ports');
    const config = {
        dashboardPort: 3030,
        apiPort: 3031
    };

    try {
        const portsFileContent = readFileSync(portsFilePath, 'utf8');
        const lines = portsFileContent.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('CONSTRAINT_DASHBOARD_PORT=')) {
                config.dashboardPort = parseInt(trimmed.split('=')[1]) || 3030;
            } else if (trimmed.startsWith('CONSTRAINT_API_PORT=')) {
                config.apiPort = parseInt(trimmed.split('=')[1]) || 3031;
            }
        }

        logger.info('Loaded port configuration from .env.ports', config);
        return config;
    } catch (error) {
        logger.warn('Could not load centralized port configuration, using defaults', {
            error: error.message,
            portsFile: portsFilePath,
            defaultConfig: config
        });
        return config;
    }
}

class DashboardServer {
    constructor(port = 3031, dashboardPort = 3030) {
        this.port = port;
        this.dashboardPort = dashboardPort;
        this.app = express();
        this.server = null;

        // Initialize configuration management
        this.config = new ConfigManager();

        // Initialize status generator
        this.statusGenerator = new StatusGenerator(this.config);

        // Initialize constraint engine with the same ConfigManager
        this.constraintEngine = new ConstraintEngine(this.config);

        // SELF-CONTAINED violations storage (ELIMINATING parallel version dependency)
        this.violationsFile = join(__dirname, '../data/violations.json');
        this.violations = [];

        // Initialize constraint engine
        this.constraintEngine.initialize().catch(error => {
            logger.error('Failed to initialize constraint engine:', error);
        });

        // Load existing violations on startup
        this.loadViolations().catch(error => {
            logger.warn('Could not load existing violations:', error.message);
        });

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Enable CORS for all origins
        this.app.use(cors());

        // Parse JSON bodies
        this.app.use(express.json());

        // Redirect to professional dashboard running on Next.js
        this.app.get('/', (req, res) => {
            res.redirect(`http://localhost:${this.dashboardPort}`);
        });

        this.app.get('/dashboard', (req, res) => {
            res.redirect(`http://localhost:${this.dashboardPort}`);
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
        this.app.post('/api/violations', this.handlePostViolations.bind(this));
        this.app.get('/api/activity', this.handleGetActivity.bind(this));
        this.app.get('/api/health', this.handleHealthCheck.bind(this));
        this.app.get('/api/projects', this.handleGetProjects.bind(this));

        // Project selection endpoint
        this.app.post('/api/projects/select', this.handleSelectProject.bind(this));

        // Constraint management
        this.app.post('/api/constraints/:id/toggle', this.handleToggleConstraint.bind(this));
        this.app.post('/api/violations/:id/resolve', this.handleResolveViolation.bind(this));
        this.app.post('/api/constraints/check', this.handleConstraintCheck.bind(this));

        // Error handling
        this.app.use(this.handleError.bind(this));
    }

    getCurrentProjectPath(req) {
        try {
            // First try to get project from query parameter or request header
            const requestedProject = req.query.project || req.headers['x-project-name'];

            const lslRegistryPath = join(__dirname, '../../../.global-lsl-registry.json');

            try {
                const registryData = JSON.parse(readFileSync(lslRegistryPath, 'utf8'));

                // If specific project requested, use that
                if (requestedProject && registryData.projects[requestedProject]) {
                    const projectPath = registryData.projects[requestedProject].projectPath;
                    logger.info(`Using requested project: ${requestedProject}`, { path: projectPath });
                    return projectPath;
                }

                // Fallback: find active project with most recent activity
                const activeProjects = Object.entries(registryData.projects || {})
                    .filter(([name, info]) => info.status === 'active')
                    .sort(([,a], [,b]) => (b.lastHealthCheck || 0) - (a.lastHealthCheck || 0));

                if (activeProjects.length > 0) {
                    const [projectName, projectInfo] = activeProjects[0];
                    logger.info(`Using most recently active project: ${projectName}`, { path: projectInfo.projectPath });
                    return projectInfo.projectPath;
                }

                logger.warn('No active projects found in LSL registry, using current working directory');
                return process.cwd();

            } catch (registryError) {
                logger.warn('Could not read LSL registry, using current working directory', { error: registryError.message });
                return process.cwd();
            }

        } catch (error) {
            logger.error('Failed to determine current project path', { error: error.message });
            return process.cwd();
        }
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
            // Get current project path for per-project constraints
            const projectPath = this.getCurrentProjectPath(req);

            // Check if grouped data is requested
            const includeGroups = req.query.grouped === 'true';

            if (includeGroups) {
                // Return grouped constraints with metadata (project-specific)
                const groupedData = this.config.getProjectConstraintsWithGroups(projectPath);
                const settings = this.config.getConstraintSettings();

                res.json({
                    status: 'success',
                    data: {
                        constraints: groupedData.groups.map(groupData => ({
                            group: groupData.group,
                            constraints: groupData.constraints.map(constraint => ({
                                id: constraint.id,
                                groupId: constraint.group,
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
                            settings: settings,
                            project_path: projectPath
                        }
                    }
                });
            } else {
                // Return flat constraints list (legacy format, project-specific)
                const constraints = this.config.getProjectConstraints(projectPath);

                res.json({
                    status: 'success',
                    data: constraints.map(constraint => ({
                        id: constraint.id,
                        groupId: constraint.group,
                        pattern: constraint.pattern,
                        message: constraint.message,
                        severity: constraint.severity,
                        enabled: constraint.enabled !== false,
                        suggestion: constraint.suggestion || null
                    })),
                    meta: {
                        project_path: projectPath
                    }
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
            const requestedProject = req.query.project || req.headers['x-project-name'];
            const limit = parseInt(req.query.limit) || 50;

            // Read violations from SELF-CONTAINED storage (ELIMINATING parallel version)
            await this.loadViolations();
            let violations = [...this.violations];

            // Filter violations by project if requested
            if (requestedProject) {
                logger.info(`Filtering violations for project: ${requestedProject}`, {
                    totalViolations: violations.length,
                    project: requestedProject,
                    requestedLimit: limit
                });

                violations = violations.filter(v =>
                    v.context === requestedProject ||
                    v.repository === requestedProject
                );

                logger.info(`Filtered violations result`, {
                    remainingViolations: violations.length,
                    project: requestedProject
                });
            }

            // Apply limit
            if (limit > 0) {
                violations = violations.slice(-limit);
            }

            // Calculate statistics
            const severityBreakdown = violations.reduce((acc, v) => {
                acc[v.severity] = (acc[v.severity] || 0) + 1;
                return acc;
            }, {});

            const responseData = {
                violations: violations,
                live_session: {
                    active_count: violations.filter(v => {
                        const hourAgo = Date.now() - (60 * 60 * 1000);
                        return new Date(v.timestamp).getTime() > hourAgo;
                    }).length,
                    compliance_score: this.calculateComplianceScore(violations),
                    trends: violations.length > 0 ? 'violations_detected' : 'stable',
                    most_recent: violations[violations.length - 1] || null
                },
                statistics: {
                    total_count: violations.length,
                    severity_breakdown: severityBreakdown,
                    project_filter: requestedProject || 'all',
                    requested_limit: limit
                }
            };

            res.json({
                status: 'success',
                data: responseData.violations,
                meta: {
                    total: responseData.statistics.total_count,
                    live_session: responseData.live_session,
                    statistics: responseData.statistics,
                    source: 'self_contained_storage',
                    filtered_by: requestedProject || 'none',
                    limit_applied: limit
                }
            });

        } catch (error) {
            logger.error('Failed to get violations', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve violations',
                error: error.message
            });
        }
    }

    async handlePostViolations(req, res) {
        try {
            const { violations } = req.body;

            if (!violations || !Array.isArray(violations)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'violations array is required'
                });
            }

            if (violations.length === 0) {
                return res.json({
                    status: 'success',
                    message: 'No violations to store',
                    data: { stored: 0 }
                });
            }

            // Get project path from request or detect current project
            const projectPath = this.getCurrentProjectPath(req);
            
            // Use project/context from request body or first violation, fallback to 'file-watcher'
            const project = req.body.project || violations[0]?.context || 'file-watcher';
            const tool = req.body.tool || violations[0]?.source || 'api';

            logger.info(`Storing ${violations.length} violations`, {
                project,
                projectPath,
                tool,
                violations: violations.map(v => ({
                    id: v.constraint_id,
                    severity: v.severity,
                    context: v.context,
                    filePath: v.file_path
                }))
            });

            // Use the existing persistViolations method
            await this.persistViolations(violations, {
                project,
                projectPath,
                tool,
                filePath: violations[0]?.file_path || 'unknown'
            });

            res.json({
                status: 'success',
                message: `Successfully stored ${violations.length} violations`,
                data: {
                    stored: violations.length,
                    project,
                    projectPath
                }
            });

        } catch (error) {
            logger.error('Failed to store violations', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                status: 'error',
                message: 'Failed to store violations',
                error: error.message
            });
        }
    }

    calculateComplianceScore(violations) {
        if (!violations || violations.length === 0) {
            return 10.0;
        }

        // Simple compliance calculation based on violation count and severity
        const criticalCount = violations.filter(v => v.severity === 'critical').length;
        const errorCount = violations.filter(v => v.severity === 'error').length;
        const warningCount = violations.filter(v => v.severity === 'warning').length;

        // Calculate score reduction based on severity weights
        const scoreReduction = (criticalCount * 3) + (errorCount * 2) + (warningCount * 1);
        const maxReduction = Math.min(scoreReduction * 0.5, 9.0); // Cap at 90% reduction

        return Math.max(1.0, 10.0 - maxReduction);
    }

    async persistViolations(violations, metadata = {}) {
        try {
            // Store violations to SELF-CONTAINED storage (ELIMINATING parallel version dependency)
            const violationsWithMetadata = violations.map(violation => ({
                ...violation,
                id: violation.id || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                timestamp: violation.timestamp || new Date().toISOString(),
                project: metadata.project || 'unknown',
                tool: metadata.tool || 'api',
                session_id: metadata.sessionId || 'api-store',
                context: violation.context || metadata.project || 'unknown',
                repository: violation.repository || metadata.project || 'unknown',
                status: 'active',
                source: metadata.source || 'api'
            }));

            // Add violations to in-memory storage
            this.violations.push(...violationsWithMetadata);

            // Write to self-contained file storage
            await this.saveViolations();

            logger.info(`Persisted ${violations.length} violations to self-contained storage`, {
                project: metadata.project,
                tool: metadata.tool,
                violationIds: violations.map(v => v.constraint_id),
                totalViolations: this.violations.length
            });

        } catch (error) {
            logger.error('Failed to persist violations:', error);
        }
    }

    async loadViolations() {
        try {
            // CONSOLIDATED VIOLATION LOADING - collecting all historical violations
            const allViolations = new Map(); // Use Map to deduplicate by ID

            // Define all violation storage sources (REAL DATA ONLY - no test data)
            const sources = [
                { name: 'main', path: this.violationsFile, description: 'main storage' },
                { name: 'backup', path: join(__dirname, '../data/violations-backup.json'), description: 'backup storage' },
                { name: 'scripts', path: join(__dirname, '../../../scripts/.constraint-violations.json'), description: 'scripts storage' },
                { name: 'merged', path: '/tmp/merged-violations.json', description: 'merged historical storage' },
                { name: 'mcp-sync', path: join(__dirname, '../../../.mcp-sync/violation-history.json'), description: 'MCP sync storage' },
                { name: 'mcp-local', path: join(__dirname, '../data/violations-mcp-sync.json'), description: 'MCP sync local copy' }
                // Removed historic-test source - only showing real violations now
            ];

            let totalLoaded = 0;
            const sourceStats = {};

            // Load violations from each source
            for (const source of sources) {
                try {
                    if (existsSync(source.path)) {
                        const data = readFileSync(source.path, 'utf8');
                        const violations = JSON.parse(data);
                        const violationArray = Array.isArray(violations) ? violations : violations.violations || [];

                        let addedCount = 0;
                        violationArray.forEach(violation => {
                            if (violation && violation.id) {
                                if (!allViolations.has(violation.id)) {
                                    allViolations.set(violation.id, {
                                        ...violation,
                                        source: source.name // Track source for debugging
                                    });
                                    addedCount++;
                                }
                            }
                        });

                        sourceStats[source.name] = { total: violationArray.length, added: addedCount };
                        totalLoaded += addedCount;
                        logger.info(`Loaded ${violationArray.length} violations from ${source.description}, ${addedCount} unique`);
                    }
                } catch (sourceError) {
                    logger.warn(`Could not load violations from ${source.description}:`, sourceError.message);
                    sourceStats[source.name] = { total: 0, added: 0, error: sourceError.message };
                }
            }

            // Convert Map back to array
            this.violations = Array.from(allViolations.values());

            // Sort by timestamp for consistency
            this.violations.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeA - timeB;
            });

            logger.info(`CONSOLIDATED VIOLATIONS: Loaded ${this.violations.length} total unique violations from ${Object.keys(sourceStats).length} sources`, sourceStats);

            // Save consolidated violations to main storage for persistence
            if (this.violations.length > 0) {
                await this.saveViolations();
            }

        } catch (error) {
            logger.error('Failed to load consolidated violations:', error);
            this.violations = [];
        }
    }

    async saveViolations() {
        try {
            // Ensure data directory exists
            const dataDir = join(__dirname, '../data');
            if (!existsSync(dataDir)) {
                await import('fs/promises').then(fs => fs.mkdir(dataDir, { recursive: true }));
            }

            writeFileSync(this.violationsFile, JSON.stringify(this.violations, null, 2));
            logger.debug(`Saved ${this.violations.length} violations to self-contained storage`);
        } catch (error) {
            logger.error('Failed to save violations:', error);
        }
    }

    async handleGetActivity(req, res) {
        try {
            // Return basic activity data for now
            res.json({
                status: 'success',
                data: {
                    recent_activity: [],
                    statistics: {
                        total_checks: 0,
                        violations_found: 0,
                        last_check: new Date().toISOString()
                    }
                }
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
            const status = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    api: 'operational',
                    constraint_engine: this.constraintEngine ? 'operational' : 'degraded',
                    file_watcher: this.constraintEngine?.getFileWatcherStatus().isRunning ? 'operational' : 'stopped'
                },
                version: '1.0.0'
            };

            res.json(status);
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
            res.status(500).json({
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async handleGetProjects(req, res) {
        try {
            // Get projects from LSL registry if available
            const lslRegistryPath = join(__dirname, '../../../.global-lsl-registry.json');
            let projects = [];

            try {
                if (existsSync(lslRegistryPath)) {
                    const registryData = JSON.parse(readFileSync(lslRegistryPath, 'utf8'));
                    projects = Object.entries(registryData.projects || {}).map(([name, info]) => ({
                        name,
                        path: info.projectPath,
                        status: info.status,
                        lastActivity: info.lastHealthCheck
                    }));
                }
            } catch (registryError) {
                logger.warn('Could not read LSL registry:', registryError.message);
            }

            // Add current project as fallback
            if (projects.length === 0) {
                projects.push({
                    name: 'current',
                    path: process.cwd(),
                    status: 'active',
                    lastActivity: Date.now()
                });
            }

            res.json({
                status: 'success',
                data: projects
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

    async handleSelectProject(req, res) {
        try {
            const { projectName } = req.body;

            if (!projectName) {
                return res.status(400).json({
                    status: 'error',
                    message: 'projectName is required'
                });
            }

            logger.info(`Project selection requested: ${projectName}`);

            res.json({
                status: 'success',
                message: `Project ${projectName} selected`,
                data: { selectedProject: projectName }
            });
        } catch (error) {
            logger.error('Failed to select project', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to select project',
                error: error.message
            });
        }
    }

    async handleToggleConstraint(req, res) {
        try {
            const { id } = req.params;
            const { enabled } = req.body;

            logger.info(`Toggle constraint ${id} to ${enabled ? 'enabled' : 'disabled'}`);

            res.json({
                status: 'success',
                message: `Constraint ${id} ${enabled ? 'enabled' : 'disabled'}`,
                data: { constraintId: id, enabled }
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

            logger.info(`Resolving violation ${id}`);

            res.json({
                status: 'success',
                message: `Violation ${id} resolved`,
                data: { violationId: id, resolved: true }
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

    async handleConstraintCheck(req, res) {
        try {
            const { content, filePath, type = 'code' } = req.body;

            if (!content) {
                return res.status(400).json({
                    status: 'error',
                    message: 'content is required'
                });
            }

            const result = await this.constraintEngine.checkConstraints({
                content,
                type,
                filePath: filePath || 'manual-check'
            });

            res.json({
                status: 'success',
                data: result
            });
        } catch (error) {
            logger.error('Failed to check constraints', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to check constraints',
                error: error.message
            });
        }
    }

    handleError(err, req, res, next) {
        logger.error('Unhandled error in dashboard server', {
            error: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
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
                        dashboardUrl: `http://localhost:${this.dashboardPort}`,
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
            dashboardUrl: `http://localhost:${this.dashboardPort}`,
            apiUrl: `http://localhost:${this.port}/api`,
            running: this.server && this.server.listening
        };
    }
}

// Start the server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const portConfig = loadPortConfiguration();
    const server = new DashboardServer(portConfig.apiPort, portConfig.dashboardPort);

    server.start().catch(error => {
        logger.error('Failed to start dashboard server:', error);
        process.exit(1);
    });

    // Handle shutdown signals
    const shutdown = (signal) => {
        logger.info(`Received ${signal}, shutting down dashboard server...`);
        server.stop().then(() => {
            logger.info('Dashboard server shutdown complete');
            process.exit(0);
        });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { DashboardServer };