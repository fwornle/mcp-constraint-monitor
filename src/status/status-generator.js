import { logger } from '../utils/logger.js';

export class StatusGenerator {
  constructor(config) {
    this.config = config;
    this.statusCache = null;
    this.lastUpdate = 0;
    this.cacheTimeout = 5000; // 5 second cache
  }

  async initialize() {
    logger.info('Status Generator initialized');
  }

  async generateStatus(sessionId) {
    try {
      const now = Date.now();
      if (this.statusCache && (now - this.lastUpdate) < this.cacheTimeout) {
        return this.statusCache;
      }

      // Get current status data
      const status = await this.getCurrentStatus(sessionId);
      
      // Cache result
      this.statusCache = status;
      this.lastUpdate = now;
      
      return status;
    } catch (error) {
      logger.error('Status generation error:', error);
      return this.getErrorStatus(error);
    }
  }

  async getCurrentStatus(sessionId) {
    // Default status - in real implementation, this would query databases
    return {
      compliance: 8.5,
      violations: 0,
      trajectory: 'exploring',
      risk: 'low',
      interventions: 0,
      healthy: true,
      session_id: sessionId || 'default',
      last_check: new Date().toISOString()
    };
  }

  getErrorStatus(error) {
    return {
      compliance: 0,
      violations: 0,
      trajectory: 'error',
      risk: 'high',
      healthy: false,
      error: error.message,
      last_check: new Date().toISOString()
    };
  }

  // Generate status line text for Claude Code integration
  generateStatusLine(status) {
    const parts = [];
    
    // Compliance score with shield (show as percentage)
    if (status.compliance !== undefined) {
      // Convert to percentage if value is between 0-10 (legacy format)
      const compliancePercent = status.compliance <= 10 ? status.compliance * 10 : status.compliance;
      parts.push(`🛡️ ${compliancePercent.toFixed(0)}%`);
    }
    
    // Trajectory icon and text
    const trajectoryIcon = this.getTrajectoryIcon(status.trajectory);
    const trajectoryText = this.getTrajectoryText(status.trajectory);
    parts.push(`${trajectoryIcon}${trajectoryText}`);
    
    // Active violations
    if (status.violations > 0) {
      parts.push(`⚠️${status.violations}`);
    }
    
    return parts.join(' ');
  }

  getTrajectoryIcon(trajectory) {
    const icons = {
      'on_track': '📈',
      'exploring': '🔍',
      'off_track': '📉',
      'blocked': '🚫',
      'implementing': '⚙️',
      'verifying': '✅',
      'error': '❌'
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
      'verifying': 'VER',
      'error': 'ERR'
    };
    
    return shortText[trajectory] || 'UNK';
  }
}