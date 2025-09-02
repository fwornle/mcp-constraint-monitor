/**
 * Constraint Monitor Dashboard
 * Real-time dashboard for monitoring coding constraints and compliance
 */

class ConstraintDashboard {
    constructor() {
        this.apiEndpoint = 'http://localhost:3001/api';
        this.updateInterval = 5000; // 5 seconds
        this.updateTimer = null;
        this.isConnected = false;
        this.data = null;
        
        this.init();
    }

    async init() {
        console.log('🛡️ Initializing Constraint Monitor Dashboard');
        
        // Start loading initial data
        await this.loadData();
        
        // Start real-time updates
        this.startRealTimeUpdates();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('✅ Dashboard initialized successfully');
    }

    async loadData() {
        try {
            this.updateConnectionStatus(true);
            
            // For now, use mock data since the API server isn't implemented yet
            // In production, this would be: const response = await fetch(`${this.apiEndpoint}/status`);
            this.data = await this.getMockData();
            
            this.updateDashboard(this.data);
            this.isConnected = true;
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.updateConnectionStatus(false);
            this.showErrorMessage('Failed to connect to constraint monitor service');
        }
    }

    async getMockData() {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
            status: {
                compliance_score: 8.5,
                active_violations: 0,
                trajectory: 'exploring',
                risk_level: 'low',
                last_updated: new Date().toISOString()
            },
            constraints: [
                {
                    id: 'no-console-log',
                    pattern: 'console\\.log',
                    message: 'Use Logger.log() instead of console.log for better log management',
                    severity: 'warning',
                    enabled: true,
                    suggestion: 'Replace with: Logger.log(\'info\', \'category\', message)'
                },
                {
                    id: 'no-var-declarations',
                    pattern: '\\bvar\\s+',
                    message: 'Use \'let\' or \'const\' instead of \'var\'',
                    severity: 'warning',
                    enabled: true,
                    suggestion: 'Use \'let\' for mutable variables, \'const\' for immutable'
                },
                {
                    id: 'proper-error-handling',
                    pattern: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
                    message: 'Empty catch blocks should be avoided',
                    severity: 'error',
                    enabled: true,
                    suggestion: 'Add proper error handling or at minimum log the error'
                },
                {
                    id: 'no-hardcoded-secrets',
                    pattern: '(api[_-]?key|password|secret|token)\\s*[=:]\\s*[\'"][^\'\"]{8,}[\'"]',
                    message: 'Potential hardcoded secret detected',
                    severity: 'critical',
                    enabled: true,
                    suggestion: 'Use environment variables or secure key management'
                },
                {
                    id: 'no-eval-usage',
                    pattern: '\\beval\\s*\\(',
                    message: 'eval() usage detected - security risk',
                    severity: 'critical',
                    enabled: true,
                    suggestion: 'Avoid eval() - use safer alternatives for dynamic code execution'
                },
                {
                    id: 'proper-function-naming',
                    pattern: 'function\\s+[a-z]',
                    message: 'Function names should start with a verb (camelCase)',
                    severity: 'info',
                    enabled: true,
                    suggestion: 'Use descriptive verb-based names: getUserData(), processResults()'
                }
            ],
            violations: [],
            activity: [
                {
                    time: 'Just now',
                    message: 'System initialized successfully',
                    type: 'info'
                },
                {
                    time: '2 minutes ago',
                    message: 'Constraint monitoring started',
                    type: 'info'
                },
                {
                    time: '5 minutes ago',
                    message: 'Docker containers started',
                    type: 'success'
                }
            ]
        };
    }

    updateDashboard(data) {
        if (!data) return;

        // Update overview metrics
        this.updateOverviewMetrics(data.status);
        
        // Update constraints grid
        this.updateConstraintsGrid(data.constraints);
        
        // Update activity feed
        this.updateActivityFeed(data.activity);
        
        // Update last updated time
        this.updateLastUpdatedTime();
    }

    updateOverviewMetrics(status) {
        // Compliance Score
        const complianceScore = document.getElementById('complianceScore');
        const complianceProgress = document.getElementById('complianceProgress');
        
        if (complianceScore && complianceProgress) {
            complianceScore.textContent = status.compliance_score.toFixed(1);
            complianceProgress.style.width = `${(status.compliance_score / 10) * 100}%`;
            
            // Update progress bar color based on score
            const progressClass = this.getComplianceClass(status.compliance_score);
            complianceProgress.className = `progress-fill ${progressClass}`;
        }

        // Active Violations
        const violationCount = document.getElementById('violationCount');
        if (violationCount) {
            violationCount.textContent = status.active_violations;
            violationCount.className = `metric-value ${status.active_violations === 0 ? 'zero' : ''}`;
        }

        // Trajectory
        const trajectoryIcon = document.getElementById('trajectoryIcon');
        const trajectoryStatus = document.getElementById('trajectoryStatus');
        
        if (trajectoryIcon && trajectoryStatus) {
            const { icon, text } = this.getTrajectoryDisplay(status.trajectory);
            trajectoryIcon.textContent = icon;
            trajectoryStatus.textContent = text;
        }

        // Risk Level
        const riskLevel = document.getElementById('riskLevel');
        if (riskLevel) {
            riskLevel.textContent = this.capitalizeFirst(status.risk_level);
            riskLevel.className = `metric-value ${status.risk_level}`;
        }
    }

    updateConstraintsGrid(constraints) {
        const grid = document.getElementById('constraintsGrid');
        if (!grid) return;

        grid.innerHTML = '';
        
        constraints.forEach(constraint => {
            const constraintElement = this.createConstraintElement(constraint);
            grid.appendChild(constraintElement);
        });
    }

    createConstraintElement(constraint) {
        const element = document.createElement('div');
        element.className = 'constraint-item';
        
        element.innerHTML = `
            <div class="constraint-header">
                <span class="constraint-id">${constraint.id}</span>
                <span class="constraint-severity ${constraint.severity}">${constraint.severity}</span>
            </div>
            <div class="constraint-message">${constraint.message}</div>
            <div class="constraint-enabled">
                <span class="constraint-toggle ${constraint.enabled ? 'enabled' : 'disabled'}"></span>
                <span>${constraint.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
        `;
        
        return element;
    }

    updateActivityFeed(activity) {
        const feed = document.getElementById('activityFeed');
        if (!feed) return;

        feed.innerHTML = '';
        
        activity.forEach(item => {
            const activityElement = this.createActivityElement(item);
            feed.appendChild(activityElement);
        });
    }

    createActivityElement(item) {
        const element = document.createElement('div');
        element.className = 'activity-item';
        
        element.innerHTML = `
            <span class="activity-time">${item.time}</span>
            <span class="activity-message">${item.message}</span>
        `;
        
        return element;
    }

    updateLastUpdatedTime() {
        const timeElement = document.getElementById('lastUpdateTime');
        if (timeElement) {
            timeElement.textContent = new Date().toLocaleTimeString();
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;

        const dot = statusElement.querySelector('.dot');
        const text = statusElement.querySelector('.text');
        
        if (connected) {
            statusElement.classList.remove('disconnected');
            text.textContent = 'Connected';
        } else {
            statusElement.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
        
        this.isConnected = connected;
    }

    getComplianceClass(score) {
        if (score >= 9.0) return 'excellent';
        if (score >= 7.0) return 'good';
        if (score >= 5.0) return 'warning';
        return 'critical';
    }

    getTrajectoryDisplay(trajectory) {
        const trajectoryMap = {
            'exploring': { icon: '🔍', text: 'Exploring' },
            'on_track': { icon: '📈', text: 'On Track' },
            'off_track': { icon: '📉', text: 'Off Track' },
            'implementing': { icon: '⚙️', text: 'Implementing' },
            'verifying': { icon: '✅', text: 'Verifying' },
            'blocked': { icon: '🚫', text: 'Blocked' }
        };
        
        return trajectoryMap[trajectory] || { icon: '❓', text: 'Unknown' };
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    startRealTimeUpdates() {
        this.updateTimer = setInterval(() => {
            this.loadData();
        }, this.updateInterval);
    }

    stopRealTimeUpdates() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    setupEventListeners() {
        // Handle visibility changes to pause/resume updates
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopRealTimeUpdates();
            } else {
                this.startRealTimeUpdates();
            }
        });

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.stopRealTimeUpdates();
        });
    }

    showErrorMessage(message) {
        const container = document.querySelector('.dashboard-content');
        if (!container) return;

        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        
        container.insertBefore(errorElement, container.firstChild);
        
        // Remove error message after 5 seconds
        setTimeout(() => {
            errorElement.remove();
        }, 5000);
    }

    showSuccessMessage(message) {
        const container = document.querySelector('.dashboard-content');
        if (!container) return;

        const successElement = document.createElement('div');
        successElement.className = 'success-message';
        successElement.textContent = message;
        
        container.insertBefore(successElement, container.firstChild);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
            successElement.remove();
        }, 3000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConstraintDashboard();
});

// Export for potential external usage
window.ConstraintDashboard = ConstraintDashboard;