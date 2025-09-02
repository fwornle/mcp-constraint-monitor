#!/usr/bin/env node

/**
 * Claude Code Status Line: Constraint Monitor
 * 
 * Displays real-time constraint compliance in Claude Code status line
 * 
 * Usage in Claude Code status line configuration:
 * {
 *   "statusLine": {
 *     "command": "node",
 *     "args": ["./integrations/constraint-monitor/src/status/constraint-status-line.js"],
 *     "refreshInterval": 1000
 *   }
 * }
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class ConstraintStatusLine {
  constructor() {
    this.config = this.loadConfig();
    this.dataPath = join(__dirname, '../data');
    this.statusCache = null;
    this.lastUpdate = 0;
    this.cacheTimeout = 5000; // 5 second cache
  }

  loadConfig() {
    try {
      const configPath = join(__dirname, '../config/status-line.json');
      if (existsSync(configPath)) {
        return JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      // Use default config
    }

    return {
      enabled: true,
      showCompliance: true,
      showViolations: true,
      showTrajectory: true,
      maxLength: 50,
      updateInterval: 1000,
      colors: {
        excellent: 'green',
        good: 'cyan', 
        warning: 'yellow',
        critical: 'red'
      },
      icons: {
        shield: '🛡️',
        warning: '⚠️', 
        trajectory: '📈',
        blocked: '🚫'
      }
    };
  }

  async generateStatus() {
    try {
      // Check cache first
      const now = Date.now();
      if (this.statusCache && (now - this.lastUpdate) < this.cacheTimeout) {
        return this.statusCache;
      }

      // Get current status data
      const statusData = await this.getStatusData();
      
      // Generate status display
      const status = this.buildStatusDisplay(statusData);
      
      // Cache result
      this.statusCache = status;
      this.lastUpdate = now;
      
      return status;
    } catch (error) {
      return this.getErrorStatus(error);
    }
  }

  async getStatusData() {
    const statusData = {
      compliance: 8.5,
      violations: 0,
      trajectory: 'on_track',
      risk: 'low',
      interventions: 0,
      healthy: true
    };

    try {
      // Try to get data from constraint monitor service
      if (this.config.serviceEndpoint) {
        const serviceData = await this.fetchFromService();
        Object.assign(statusData, serviceData);
      } else {
        // Fallback to local data files
        const localData = this.loadLocalData();
        Object.assign(statusData, localData);
      }
    } catch (error) {
      // Use default/cached data
      statusData.healthy = false;
      statusData.error = error.message;
    }

    return statusData;
  }

  async fetchFromService() {
    try {
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(`${this.config.serviceEndpoint}/api/status`, {
        timeout: 2000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new Error(`Service unavailable: ${error.message}`);
    }
  }

  loadLocalData() {
    const data = {
      compliance: 8.5,
      violations: 0,
      trajectory: 'exploring',
      risk: 'low'
    };

    try {
      // Check violation queue
      const violationQueuePath = join(this.dataPath, 'violation-queue.json');
      if (existsSync(violationQueuePath)) {
        const queueData = JSON.parse(readFileSync(violationQueuePath, 'utf8'));
        data.violations = queueData.violations?.filter(v => !v.resolved).length || 0;
      }

      // Check recent metrics
      const metricsPath = join(this.dataPath, 'metrics.json');
      if (existsSync(metricsPath)) {
        const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
        data.compliance = metrics.complianceScore || 8.5;
        data.trajectory = metrics.trajectory || 'exploring';
        data.risk = metrics.riskLevel || 'low';
      }
    } catch (error) {
      // Use defaults on error
    }

    return data;
  }

  buildStatusDisplay(data) {
    const parts = [];
    
    if (!data.healthy && data.error) {
      return {
        text: `${this.config.icons.warning}CM:OFF`,
        color: this.config.colors.critical,
        tooltip: `Constraint Monitor: ${data.error}`,
        onClick: this.getClickAction()
      };
    }

    // Compliance score
    if (this.config.showCompliance) {
      const complianceIcon = this.config.icons.shield;
      const score = typeof data.compliance === 'number' ? data.compliance.toFixed(1) : '?';
      parts.push(`${complianceIcon} ${score}`);  // Added space for better rendering
    }

    // Active violations
    if (this.config.showViolations && data.violations > 0) {
      const violationIcon = this.config.icons.warning;
      parts.push(`${violationIcon}${data.violations}`);
    }

    // Trajectory status
    if (this.config.showTrajectory) {
      const trajectoryIcon = this.getTrajectoryIcon(data.trajectory);
      const trajectoryText = this.getTrajectoryText(data.trajectory);
      parts.push(`${trajectoryIcon}${trajectoryText}`);
    }

    const text = parts.join(' ');
    const color = this.getStatusColor(data);
    const tooltip = this.buildTooltip(data);

    return {
      text: this.truncateText(text),
      color,
      tooltip,
      onClick: this.getClickAction()
    };
  }

  getTrajectoryIcon(trajectory) {
    const icons = {
      'on_track': '📈',
      'exploring': '🔍', 
      'off_track': '📉',
      'blocked': '🚫',
      'implementing': '⚙️',
      'verifying': '✅'
    };
    
    return icons[trajectory] || '❓';
  }

  getTrajectoryText(trajectory) {
    const shortText = {
      'on_track': 'ON',
      'exploring': 'EX',
      'off_track': 'OFF',
      'blocked': 'BLK',
      'implementing': 'IMP',
      'verifying': 'VER'
    };
    
    return shortText[trajectory] || 'UNK';
  }

  getStatusColor(data) {
    // Critical violations - red
    if (data.violations > 0 && data.risk === 'high') {
      return this.config.colors.critical;
    }
    
    // Active violations - yellow
    if (data.violations > 0) {
      return this.config.colors.warning;
    }
    
    // Low compliance - yellow
    if (data.compliance < 7.0) {
      return this.config.colors.warning;
    }
    
    // Good compliance - cyan
    if (data.compliance < 9.0) {
      return this.config.colors.good;
    }
    
    // Excellent compliance - green
    return this.config.colors.excellent;
  }

  buildTooltip(data) {
    const lines = ['🛡️ Constraint Monitor Status'];
    lines.push('━'.repeat(28));
    
    // Compliance section
    if (data.compliance !== undefined) {
      const score = data.compliance.toFixed(1);
      const scoreBar = this.getScoreBar(data.compliance);
      lines.push(`📊 Compliance: ${score}/10.0`);
      lines.push(`   ${scoreBar} ${this.getComplianceLabel(data.compliance)}`);
    }
    
    // Violations section
    if (data.violations > 0) {
      lines.push(`⚠️  Active Issues: ${data.violations} violation${data.violations > 1 ? 's' : ''}`);
    } else {
      lines.push('✅ Status: No active violations');
    }
    
    // Activity section
    if (data.trajectory) {
      const trajectoryIcon = this.getTrajectoryIcon(data.trajectory);
      const trajectoryText = data.trajectory.replace('_', ' ');
      lines.push(`${trajectoryIcon} Activity: ${this.capitalizeFirst(trajectoryText)}`);
    }
    
    // Risk assessment
    if (data.risk) {
      const riskIcon = this.getRiskIcon(data.risk);
      lines.push(`${riskIcon} Risk Level: ${this.capitalizeFirst(data.risk)}`);
    }
    
    // Performance metrics
    if (data.interventions !== undefined) {
      lines.push(`🔧 Interventions: ${data.interventions}`);
    }
    
    // System health
    const healthIcon = data.healthy !== false ? '🟢' : '🔴';
    const healthText = data.healthy !== false ? 'Operational' : 'Issues Detected';
    lines.push(`${healthIcon} System: ${healthText}`);
    
    lines.push('');
    lines.push('━'.repeat(28));
    lines.push('🖱️  Click to open dashboard');
    lines.push('🔄 Updates every 5 seconds');
    
    return lines.join('\n');
  }

  getScoreBar(score) {
    const width = 15;
    const filled = Math.round((score / 10) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  getComplianceLabel(score) {
    if (score >= 9.0) return '(Excellent)';
    if (score >= 7.0) return '(Good)';
    if (score >= 5.0) return '(Fair)';
    return '(Needs Attention)';
  }

  getRiskIcon(risk) {
    const icons = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🔴',
      'critical': '🚨'
    };
    return icons[risk] || '❓';
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  truncateText(text) {
    if (text.length <= this.config.maxLength) {
      return text;
    }
    
    return text.substring(0, this.config.maxLength - 3) + '...';
  }

  getClickAction() {
    return 'open-dashboard';
  }

  getErrorStatus(error) {
    return {
      text: `${this.config.icons.warning}CM:ERR`,
      color: this.config.colors.critical,
      tooltip: `Constraint Monitor Error: ${error.message}`,
      onClick: this.getClickAction()
    };
  }
}

// Main execution
async function main() {
  try {
    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.log(JSON.stringify({
        text: '⚠️CM:TIMEOUT',
        color: 'red',
        tooltip: 'Constraint Monitor: Status check timed out'
      }));
      process.exit(0);
    }, 3000);

    const statusLine = new ConstraintStatusLine();
    const status = await statusLine.generateStatus();
    
    clearTimeout(timeout);
    console.log(JSON.stringify(status));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({
      text: '⚠️CM:ERR',
      color: 'red', 
      tooltip: `Constraint Monitor Error: ${error.message}`
    }));
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// Run main function
main();