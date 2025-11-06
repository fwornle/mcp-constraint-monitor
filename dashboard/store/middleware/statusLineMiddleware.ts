import { Middleware, isAction } from '@reduxjs/toolkit'
import { RootState, AppDispatch } from '../index'
import { fetchConstraintData } from '../slices/constraintsSlice'
// Removed fetchGlobalHealth, fetchServiceHealth - these endpoints don't exist
import { fetchProjects, detectCurrentProject } from '../slices/projectsSlice'
import { fetchApiCosts, fetchCurrentSessionCost } from '../slices/apiCostSlice'
import { fetchLslStatus, fetchLslMetrics } from '../slices/lslWindowSlice'

interface StatusLineConfig {
  enableAutoRefresh: boolean
  intervals: {
    constraints: number     // 5 seconds
    globalHealth: number   // 10 seconds
    projects: number       // 30 seconds
    apiCost: number       // 15 seconds
    lslWindow: number     // 5 seconds
  }
  retryAttempts: number
  retryDelay: number // milliseconds
}

const defaultConfig: StatusLineConfig = {
  enableAutoRefresh: false, // Disabled by default - users can enable monitoring mode if needed
  intervals: {
    constraints: 120000,   // 120 seconds (2 minutes) - only when monitoring enabled
    globalHealth: 60000,   // 60 seconds (1 minute) - health checks when monitoring enabled
    projects: 180000,      // 180 seconds (3 minutes) - projects list rarely changes
    apiCost: 300000,       // 300 seconds (5 minutes) - cost data doesn't change frequently
    lslWindow: 120000      // 120 seconds (2 minutes) - LSL status when monitoring enabled
  },
  retryAttempts: 3,
  retryDelay: 2000
}

class StatusLineManager {
  private store: { dispatch: AppDispatch; getState: () => RootState } | null = null
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private config: StatusLineConfig = defaultConfig
  private retryCounters: Map<string, number> = new Map()
  private isActive: boolean = true

  setStore(store: { dispatch: AppDispatch; getState: () => RootState }) {
    this.store = store
  }

  updateConfig(newConfig: Partial<StatusLineConfig>) {
    this.config = { ...this.config, ...newConfig }

    // Restart intervals with new timing
    if (this.isActive) {
      this.stopAutoRefresh()
      this.startAutoRefresh()
    }
  }

  startAutoRefresh() {
    if (!this.store || !this.config.enableAutoRefresh) return

    console.log('🔄 Starting status line auto-refresh')

    // Constraints monitoring
    this.scheduleRefresh('constraints', () => {
      const state = this.store!.getState()
      const currentProject = state.projects.currentProject
      return this.store!.dispatch(fetchConstraintData(currentProject || undefined))
    }, this.config.intervals.constraints)

    // NOTE: Removed global health and service health monitoring 
    // as these endpoints (/api/health/global, /api/health/services) don't exist
    // The API only has /api/health for basic health checks

    // Projects monitoring
    this.scheduleRefresh('projects', () => {
      return this.store!.dispatch(fetchProjects())
    }, this.config.intervals.projects)

    // Current project detection (less frequent)
    this.scheduleRefresh('projectDetection', () => {
      return this.store!.dispatch(detectCurrentProject())
    }, this.config.intervals.projects * 2)

    // API cost monitoring - daily data
    this.scheduleRefresh('apiCostDaily', () => {
      return this.store!.dispatch(fetchApiCosts({ period: 'daily' }))
    }, this.config.intervals.apiCost)

    // Current session cost (more frequent)
    this.scheduleRefresh('apiCostSession', () => {
      return this.store!.dispatch(fetchCurrentSessionCost())
    }, this.config.intervals.apiCost / 3)

    // LSL window monitoring
    this.scheduleRefresh('lslStatus', () => {
      return this.store!.dispatch(fetchLslStatus())
    }, this.config.intervals.lslWindow)

    // LSL metrics (less frequent)
    this.scheduleRefresh('lslMetrics', () => {
      return this.store!.dispatch(fetchLslMetrics({ timeframe: '24h' }))
    }, this.config.intervals.lslWindow * 4)

    this.isActive = true
  }

  stopAutoRefresh() {
    console.log('⏹️  Stopping status line auto-refresh')

    this.intervals.forEach((interval, key) => {
      clearInterval(interval)
    })
    this.intervals.clear()
    this.retryCounters.clear()
    this.isActive = false
  }

  private scheduleRefresh(
    key: string,
    fetchAction: () => Promise<any>,
    interval: number
  ) {
    // Initial fetch
    this.performRefresh(key, fetchAction)

    // Schedule periodic refresh
    const intervalId = setInterval(() => {
      this.performRefresh(key, fetchAction)
    }, interval)

    this.intervals.set(key, intervalId)
  }

  private async performRefresh(key: string, fetchAction: () => Promise<any>) {
    try {
      await fetchAction()
      // Reset retry counter on success
      this.retryCounters.set(key, 0)
    } catch (error) {
      const retryCount = this.retryCounters.get(key) || 0

      if (retryCount < this.config.retryAttempts) {
        console.warn(`⚠️ Status line refresh failed for ${key}, retrying in ${this.config.retryDelay}ms (attempt ${retryCount + 1}/${this.config.retryAttempts})`)

        this.retryCounters.set(key, retryCount + 1)

        // Schedule retry
        setTimeout(() => {
          this.performRefresh(key, fetchAction)
        }, this.config.retryDelay)
      } else {
        console.error(`❌ Status line refresh failed for ${key} after ${this.config.retryAttempts} attempts:`, error)
        // Reset counter and continue with regular intervals
        this.retryCounters.set(key, 0)
      }
    }
  }

  // Handle visibility change to pause/resume when page is hidden
  handleVisibilityChange() {
    if (document.hidden) {
      console.log('📴 Page hidden, pausing status line updates')
      this.stopAutoRefresh()
    } else {
      console.log('📱 Page visible, resuming status line updates')
      this.startAutoRefresh()
    }
  }

  // Handle focus/blur to optimize when Claude Code is active
  handleFocusChange(hasFocus: boolean) {
    if (!hasFocus) {
      // Reduce frequency when not focused
      this.updateConfig({
        intervals: {
          constraints: this.config.intervals.constraints * 2,
          globalHealth: this.config.intervals.globalHealth * 2,
          projects: this.config.intervals.projects * 2,
          apiCost: this.config.intervals.apiCost * 2,
          lslWindow: this.config.intervals.lslWindow * 2
        }
      })
    } else {
      // Restore normal frequency
      this.updateConfig({ intervals: defaultConfig.intervals })
    }
  }
}

// Global instance
const statusLineManager = new StatusLineManager()

// Middleware implementation
export const statusLineMiddleware: Middleware<{}, RootState, AppDispatch> =
  (store) => (next) => (action) => {
    const result = next(action)

    // Initialize manager with store on first action
    if (!statusLineManager['store']) {
      statusLineManager.setStore(store)

      // Start auto-refresh after initial hydration
      setTimeout(() => {
        statusLineManager.startAutoRefresh()
      }, 1000)

      // Set up visibility change listeners
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          statusLineManager.handleVisibilityChange()
        })

        window.addEventListener('focus', () => {
          statusLineManager.handleFocusChange(true)
        })

        window.addEventListener('blur', () => {
          statusLineManager.handleFocusChange(false)
        })
      }
    }

    // Handle specific actions that should trigger immediate updates
    if (isAction(action)) {
      switch (action.type) {
        case 'projects/setCurrentProject/fulfilled':
        case 'projects/setActive/fulfilled':
          // When project changes, immediately refresh constraint data
          setTimeout(() => {
            const state = store.getState()
            store.dispatch(fetchConstraintData(state.projects.currentProject || undefined))
          }, 100)
          break

        // Removed globalHealth/restartService case - fetchServiceHealth endpoint doesn't exist

        case 'apiCost/logUsage/fulfilled':
          // When API usage is logged, refresh session cost
          setTimeout(() => {
            store.dispatch(fetchCurrentSessionCost())
          }, 500)
          break

        case 'lslWindow/startSession/fulfilled':
        case 'lslWindow/stopSession/fulfilled':
          // When LSL session state changes, refresh status
          setTimeout(() => {
            store.dispatch(fetchLslStatus())
          }, 1000)
          break
      }
    }

    return result
  }

// Export manager for external control
export { statusLineManager }
export type { StatusLineConfig }

// Utility functions for components
export const useStatusLineConfig = () => {
  return {
    startAutoRefresh: () => statusLineManager.startAutoRefresh(),
    stopAutoRefresh: () => statusLineManager.stopAutoRefresh(),
    updateConfig: (config: Partial<StatusLineConfig>) => statusLineManager.updateConfig(config)
  }
}