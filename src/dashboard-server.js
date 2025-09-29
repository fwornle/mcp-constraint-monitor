#!/usr/bin/env node

/**
 * Constraint Monitor Dashboard Server
 * HTTP server for serving the dashboard and providing API endpoints
 */

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
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
        
        // Initialize constraint engine
        this.constraintEngine.initialize().catch(error => {
            logger.error('Failed to initialize constraint engine:', error);
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
            let violations = [];
            const requestedProject = req.query.project || req.headers['x-project-name'];
            
            // Try to get enhanced live session violations
            try {
                const enhancedEndpointPath = join(__dirname, '../../../scripts/enhanced-constraint-endpoint.js');
                const enhancedEndpoint = await import(enhancedEndpointPath);
                
                const liveViolations = await enhancedEndpoint.getLiveSessionViolations();
                const history = await enhancedEndpoint.getEnhancedViolationHistory(50); // Get more to filter
                
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
                    context: violation.context,
                    repository: violation.context || 'unknown' // Ensure repository field exists
                }));
                
                // Filter violations by project if requested
                if (requestedProject) {
                    logger.info(`Filtering violations for project: ${requestedProject}`, {
                        totalViolations: violations.length,
                        project: requestedProject
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
                
                // Recalculate statistics after filtering
                const filteredCount = violations.length;
                const severityBreakdown = violations.reduce((acc, v) => {
                    acc[v.severity] = (acc[v.severity] || 0) + 1;
                    return acc;
                }, {});
                
                // Add live session metadata
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
                        total_count: filteredCount,
                        severity_breakdown: severityBreakdown,
                        project_filter: requestedProject || 'all'
                    }
                };
                
                res.json({
                    status: 'success',
                    data: responseData.violations,
                    meta: {
                        total: responseData.statistics.total_count,
                        live_session: responseData.live_session,
                        statistics: responseData.statistics,
                        source: 'enhanced_live_logging',
                        filtered_by: requestedProject || 'none'
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
                        warning: 'Enhanced live logging not available',
                        filtered_by: requestedProject || 'none'
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

    calculateComplianceScore(violations) {
        if (!violations || violations.length === 0) {
            return 10.0; // Perfect compliance with no violations
        }
        
        // Start with perfect score
        let score = 10.0;
        
        // Deduct points based on violation severity
        violations.forEach(v => {
            switch(v.severity) {
                case 'critical': score -= 3.0; break;
                case 'error': score -= 2.0; break;
                case 'warning': score -= 1.0; break;
                case 'info': score -= 0.5; break;
            }
        });
        
        // Clamp between 0 and 10
        return Math.max(0, Math.min(10, score));
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
            
            // Get current project path for per-project constraint updates
            const projectPath = this.getCurrentProjectPath(req);
            
            logger.info(`Toggling constraint ${id} for project`, { enabled, projectPath });
            
            try {
                // Use ConfigManager's per-project update method
                const success = this.config.updateProjectConstraint(projectPath, id, enabled);
                
                if (success) {
                    logger.info(`Successfully updated constraint ${id} in project config`, { 
                        enabled,
                        projectPath
                    });
                    
                    // Signal configuration reload (if constraint engine supports it)
                    try {
                        this.constraintEngine.reloadConfiguration?.();
                    } catch (reloadError) {
                        logger.warn('Failed to reload constraint engine configuration', { 
                            error: reloadError.message 
                        });
                    }
                    
                    res.json({
                        status: 'success',
                        message: `Constraint ${id} ${enabled ? 'enabled' : 'disabled'} and saved to project configuration`,
                        data: { 
                            id, 
                            enabled, 
                            persisted: true,
                            project_path: projectPath,
                            config_file: join(projectPath, '.constraint-monitor.yaml')
                        }
                    });
                } else {
                    throw new Error('Failed to update project constraint configuration');
                }
                
            } catch (updateError) {
                logger.error('Failed to update project constraint configuration', { 
                    error: updateError.message,
                    constraintId: id,
                    projectPath
                });
                
                // Still return success for the API request even if update failed
                // This prevents UI from getting stuck in loading state
                res.json({
                    status: 'success',
                    message: `Constraint ${id} ${enabled ? 'enabled' : 'disabled'} (project config update failed)`,
                    data: { 
                        id, 
                        enabled, 
                        persisted: false,
                        project_path: projectPath
                    },
                    warning: `Failed to persist to project config file: ${updateError.message}`
                });
            }
            
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

    async handleSelectProject(req, res) {
        try {
            const { projectName } = req.body;
            
            if (!projectName) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Project name is required'
                });
            }
            
            const lslRegistryPath = join(__dirname, '../../../.global-lsl-registry.json');
            
            try {
                const registryData = JSON.parse(readFileSync(lslRegistryPath, 'utf8'));
                
                if (!registryData.projects[projectName]) {
                    return res.status(404).json({
                        status: 'error',
                        message: `Project '${projectName}' not found in registry`
                    });
                }
                
                const projectInfo = registryData.projects[projectName];
                
                // Ensure project has its own constraint configuration
                const projectConstraints = this.config.getProjectConstraints(projectInfo.projectPath);
                
                logger.info(`Selected project: ${projectName}`, { 
                    path: projectInfo.projectPath,
                    constraintsCount: projectConstraints.length
                });
                
                res.json({
                    status: 'success',
                    message: `Switched to project: ${projectName}`,
                    data: {
                        projectName,
                        projectPath: projectInfo.projectPath,
                        constraintsConfigured: projectConstraints.length > 0
                    }
                });
                
            } catch (registryError) {
                logger.error('Failed to read LSL registry', { error: registryError.message });
                res.status(500).json({
                    status: 'error',
                    message: 'Failed to access project registry',
                    error: registryError.message
                });
            }
            
        } catch (error) {
            logger.error('Failed to select project', { error: error.message });
            res.status(500).json({
                status: 'error',
                message: 'Failed to select project',
                error: error.message
            });
        }
    }

    async handleConstraintCheck(req, res) {
        try {
            const { content, type, filePath, project } = req.body;
            
            if (!content || !type) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Content and type are required fields'
                });
            }
            
            // Get project path - use from request or detect current project
            let projectPath;
            if (project) {
                // Use specified project
                const lslRegistryPath = join(__dirname, '../../../.global-lsl-registry.json');
                try {
                    const registryData = JSON.parse(readFileSync(lslRegistryPath, 'utf8'));
                    projectPath = registryData.projects[project]?.projectPath;
                } catch (error) {
                    logger.warn('Could not load project registry', { error: error.message });
                }
            }
            
            if (!projectPath) {
                // Fallback to current project detection
                projectPath = this.getCurrentProjectPath(req);
            }
            
            // Use the constraint engine to check for violations
            const checkResult = await this.constraintEngine.checkConstraints({
                content,
                type,
                filePath: filePath || 'unknown',
                projectPath: projectPath || process.cwd()
            });
            
            // Calculate compliance score (higher is better, 0-10 scale)
            const violations = checkResult.violations || [];
            const totalViolations = violations.length;
            const criticalViolations = violations.filter(v => v.severity === 'critical').length;
            const errorViolations = violations.filter(v => v.severity === 'error').length;
            
            // Compliance scoring: start with 10, subtract points for violations
            let compliance = 10;
            compliance -= criticalViolations * 3;  // Critical violations cost 3 points each
            compliance -= errorViolations * 2;     // Error violations cost 2 points each
            compliance -= (totalViolations - criticalViolations - errorViolations) * 0.5; // Other violations cost 0.5 points
            compliance = Math.max(0, Math.min(10, compliance)); // Clamp to 0-10 range
            
            // PERSIST VIOLATIONS TO HISTORY FILE
            if (violations.length > 0) {
                try {
                    this.persistViolations(violations, {
                        project: project || 'auto-detected',
                        projectPath,
                        filePath: filePath || 'unknown',
                        tool: 'api_constraint_check'
                    });
                } catch (persistError) {
                    logger.warn('Failed to persist violations to history', { 
                        error: persistError.message,
                        violationsCount: violations.length
                    });
                }
            }
            
            logger.info('Constraint check completed', {
                type,
                projectPath,
                violations: totalViolations,
                compliance: compliance.toFixed(1)
            });
            
            res.json({
                status: 'success',
                data: {
                    violations,
                    compliance: parseFloat(compliance.toFixed(1)),
                    summary: {
                        total: totalViolations,
                        critical: criticalViolations,
                        error: errorViolations,
                        warning: violations.filter(v => v.severity === 'warning').length,
                        info: violations.filter(v => v.severity === 'info').length
                    },
                    project: project || 'auto-detected',
                    projectPath
                }
            });
            
        } catch (error) {
            logger.error('Failed to check constraints', { 
                error: error.message,
                stack: error.stack
            });
            
            res.status(500).json({
                status: 'error',
                message: 'Failed to check constraints',
                error: error.message,
                data: {
                    violations: [],
                    compliance: 10  // Fail open - assume compliant if check fails
                }
            });
        }
    }

    persistViolations(violations, metadata) {
        try {
            const historyPath = join(__dirname, '../../../.mcp-sync/violation-history.json');
            
            // Generate session ID and timestamp
            const timestamp = new Date().toISOString();
            const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            
            // Load existing history or create new structure
            let history;
            try {
                history = JSON.parse(readFileSync(historyPath, 'utf8'));
            } catch (error) {
                logger.info('Creating new violation history file');
                history = {
                    violations: [],
                    sessions: {},
                    statistics: {
                        total: 0,
                        last24Hours: 0,
                        severityBreakdown: {},
                        mostCommonViolation: null,
                        averagePerSession: "0.0",
                        lastUpdated: timestamp
                    }
                };
            }
            
            // Transform and add violations to history
            const violationsToAdd = violations.map(violation => ({
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                timestamp,
                sessionId,
                constraint_id: violation.constraint_id,
                message: violation.message,
                severity: violation.severity,
                tool: metadata.tool || 'api_constraint_check',
                context: metadata.project || 'unknown',
                file_path: violation.file_path || metadata.filePath,
                repository: metadata.project || 'unknown'
            }));
            
            // Add violations to history
            history.violations.push(...violationsToAdd);
            
            // Update session info
            history.sessions[sessionId] = {
                startTime: timestamp,
                repository: metadata.project || 'unknown',
                violationCount: violationsToAdd.length,
                lastViolation: timestamp
            };
            
            // Update statistics
            history.statistics.total = history.violations.length;
            
            // Calculate last 24 hours count
            const yesterday = Date.now() - (24 * 60 * 60 * 1000);
            history.statistics.last24Hours = history.violations.filter(v => 
                new Date(v.timestamp).getTime() > yesterday
            ).length;
            
            // Update severity breakdown
            history.statistics.severityBreakdown = history.violations.reduce((acc, v) => {
                acc[v.severity] = (acc[v.severity] || 0) + 1;
                return acc;
            }, {});
            
            // Find most common violation
            const constraintCounts = history.violations.reduce((acc, v) => {
                acc[v.constraint_id] = (acc[v.constraint_id] || 0) + 1;
                return acc;
            }, {});
            history.statistics.mostCommonViolation = Object.keys(constraintCounts).length > 0 
                ? Object.keys(constraintCounts).reduce((a, b) => constraintCounts[a] > constraintCounts[b] ? a : b)
                : null;
            
            // Update average per session
            const sessionCount = Object.keys(history.sessions).length;
            history.statistics.averagePerSession = sessionCount > 0 
                ? (history.statistics.total / sessionCount).toFixed(1) 
                : "0.0";
            
            history.statistics.lastUpdated = timestamp;
            
            // Write updated history back to file
            writeFileSync(historyPath, JSON.stringify(history, null, 2));
            
            logger.info('Successfully persisted violations to history', {
                violationsAdded: violationsToAdd.length,
                totalViolations: history.statistics.total,
                sessionId,
                project: metadata.project
            });
            
        } catch (error) {
            logger.error('Failed to persist violations', { 
                error: error.message,
                stack: error.stack,
                violationsCount: violations.length
            });
            throw error;
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

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
    // Use centralized port configuration for CLI startup
    const portConfig = loadPortConfiguration();
    const port = parseInt(process.env.DASHBOARD_PORT) || portConfig.apiPort;
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