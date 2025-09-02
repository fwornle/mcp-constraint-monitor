#!/usr/bin/env node

/**
 * Dashboard Launcher Script
 * Starts the constraint monitor dashboard and opens it in the browser
 */

import { DashboardServer } from '../src/dashboard-server.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../src/utils/logger.js';

const execAsync = promisify(exec);

class DashboardLauncher {
    constructor() {
        this.server = null;
        this.port = parseInt(process.env.DASHBOARD_PORT) || 3001;
    }

    async launch() {
        try {
            logger.info('🚀 Launching Constraint Monitor Dashboard...');
            
            // Check if dashboard server is already running
            const isRunning = await this.checkServerRunning();
            
            if (isRunning) {
                logger.info('✅ Dashboard server already running');
                await this.openBrowser();
                return;
            }
            
            // Start the dashboard server
            this.server = new DashboardServer(this.port);
            await this.server.start();
            
            // Wait a moment for server to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Open dashboard in browser
            await this.openBrowser();
            
            logger.info('✅ Dashboard launched successfully', {
                url: `http://localhost:${this.port}/dashboard`
            });
            
            // Keep process alive if running as standalone
            if (process.argv.includes('--standalone')) {
                this.setupGracefulShutdown();
                logger.info('📱 Dashboard server running in standalone mode...');
                logger.info('🔄 Press Ctrl+C to stop');
            }
            
        } catch (error) {
            logger.error('❌ Failed to launch dashboard', { error: error.message });
            throw error;
        }
    }

    async checkServerRunning() {
        try {
            const { default: fetch } = await import('node-fetch');
            const response = await fetch(`http://localhost:${this.port}/api/health`, {
                timeout: 2000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async openBrowser() {
        const url = `http://localhost:${this.port}/dashboard`;
        
        try {
            const platform = process.platform;
            let command;
            
            switch (platform) {
                case 'darwin':  // macOS
                    command = `open "${url}"`;
                    break;
                case 'win32':   // Windows
                    command = `start "${url}"`;
                    break;
                default:        // Linux and others
                    command = `xdg-open "${url}"`;
                    break;
            }
            
            await execAsync(command);
            logger.info('🌐 Dashboard opened in browser', { url });
            
        } catch (error) {
            logger.warn('⚠️  Could not open browser automatically', { 
                error: error.message,
                url,
                message: 'Please open the URL manually'
            });
            
            // Fallback: show URL in console
            console.log('\n' + '═'.repeat(60));
            console.log('🛡️  CONSTRAINT MONITOR DASHBOARD');
            console.log('═'.repeat(60));
            console.log(`📱 Dashboard URL: ${url}`);
            console.log(`🔗 API Endpoint: http://localhost:${this.port}/api`);
            console.log('═'.repeat(60) + '\n');
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`🛑 Received ${signal}, shutting down dashboard...`);
            
            if (this.server) {
                await this.server.stop();
            }
            
            logger.info('✅ Dashboard shutdown complete');
            process.exit(0);
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('💥 Uncaught Exception', { error: error.message, stack: error.stack });
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('💥 Unhandled Rejection', { reason, promise });
            process.exit(1);
        });
    }

    async getServerInfo() {
        if (this.server) {
            return this.server.getServerInfo();
        }
        
        return {
            port: this.port,
            dashboardUrl: `http://localhost:${this.port}/dashboard`,
            apiUrl: `http://localhost:${this.port}/api`,
            running: await this.checkServerRunning()
        };
    }
}

// CLI Support
if (import.meta.url === `file://${process.argv[1]}`) {
    const launcher = new DashboardLauncher();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const standalone = args.includes('--standalone');
    const port = args.find(arg => arg.startsWith('--port='))?.split('=')[1];
    
    if (port) {
        launcher.port = parseInt(port);
    }
    
    launcher.launch().catch((error) => {
        console.error('❌ Dashboard launch failed:', error.message);
        process.exit(1);
    });
}

export { DashboardLauncher };