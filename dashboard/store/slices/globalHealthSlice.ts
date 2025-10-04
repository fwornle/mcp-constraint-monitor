import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

// Types for global health state
export interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  lastCheck: string
  responseTime?: number
  endpoint?: string
  error?: string
}

export interface GlobalHealthState {
  // Core health metrics
  overallStatus: 'healthy' | 'degraded' | 'down'
  services: ServiceStatus[]

  // Health indicators
  healthScore: number // 0-100%
  criticalIssues: number
  warnings: number

  // System metrics
  systemLoad: number
  memoryUsage: number
  diskUsage: number

  // UI state
  loading: boolean
  error: string | null
  lastUpdate: number
  autoRefresh: boolean
  refreshInterval: number // seconds
}

const initialState: GlobalHealthState = {
  overallStatus: 'healthy',
  services: [],
  healthScore: 100,
  criticalIssues: 0,
  warnings: 0,
  systemLoad: 0,
  memoryUsage: 0,
  diskUsage: 0,
  loading: false,
  error: null,
  lastUpdate: 0,
  autoRefresh: true,
  refreshInterval: 30
}

// Async thunks for API calls
export const fetchGlobalHealth = createAsyncThunk(
  'globalHealth/fetchData',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/health/global`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const fetchServiceHealth = createAsyncThunk(
  'globalHealth/fetchServices',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/health/services`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const restartService = createAsyncThunk(
  'globalHealth/restartService',
  async ({ serviceName }: { serviceName: string }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/health/services/${serviceName}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to restart service: ${response.statusText}`)
    }

    return { serviceName }
  }
)

const globalHealthSlice = createSlice({
  name: 'globalHealth',
  initialState,
  reducers: {
    // Synchronous actions for UI updates
    setAutoRefresh: (state, action: PayloadAction<boolean>) => {
      state.autoRefresh = action.payload
    },

    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.refreshInterval = Math.max(10, action.payload) // Minimum 10 seconds
    },

    updateServiceStatus: (state, action: PayloadAction<ServiceStatus>) => {
      const index = state.services.findIndex(s => s.name === action.payload.name)
      if (index >= 0) {
        state.services[index] = action.payload
      } else {
        state.services.push(action.payload)
      }

      // Recalculate overall health
      const healthyServices = state.services.filter(s => s.status === 'healthy').length
      const totalServices = state.services.length

      if (totalServices > 0) {
        state.healthScore = Math.round((healthyServices / totalServices) * 100)

        // Update overall status
        const criticalServices = state.services.filter(s => s.status === 'down').length
        const degradedServices = state.services.filter(s => s.status === 'degraded').length

        if (criticalServices > 0) {
          state.overallStatus = 'down'
        } else if (degradedServices > 0) {
          state.overallStatus = 'degraded'
        } else {
          state.overallStatus = 'healthy'
        }

        state.criticalIssues = criticalServices
        state.warnings = degradedServices
      }
    },

    updateSystemMetrics: (state, action: PayloadAction<{
      systemLoad?: number
      memoryUsage?: number
      diskUsage?: number
    }>) => {
      if (action.payload.systemLoad !== undefined) {
        state.systemLoad = action.payload.systemLoad
      }
      if (action.payload.memoryUsage !== undefined) {
        state.memoryUsage = action.payload.memoryUsage
      }
      if (action.payload.diskUsage !== undefined) {
        state.diskUsage = action.payload.diskUsage
      }
    },

    clearError: (state) => {
      state.error = null
    },

    addService: (state, action: PayloadAction<ServiceStatus>) => {
      const exists = state.services.some(s => s.name === action.payload.name)
      if (!exists) {
        state.services.push(action.payload)
      }
    },

    removeService: (state, action: PayloadAction<string>) => {
      state.services = state.services.filter(s => s.name !== action.payload)
    }
  },

  extraReducers: (builder) => {
    // Handle async thunk actions
    builder
      .addCase(fetchGlobalHealth.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGlobalHealth.fulfilled, (state, action) => {
        state.loading = false
        state.lastUpdate = Date.now()

        const data = action.payload.data || action.payload

        if (data.overallStatus) {
          state.overallStatus = data.overallStatus
        }
        if (data.healthScore !== undefined) {
          state.healthScore = data.healthScore
        }
        if (data.systemLoad !== undefined) {
          state.systemLoad = data.systemLoad
        }
        if (data.memoryUsage !== undefined) {
          state.memoryUsage = data.memoryUsage
        }
        if (data.diskUsage !== undefined) {
          state.diskUsage = data.diskUsage
        }
        if (data.criticalIssues !== undefined) {
          state.criticalIssues = data.criticalIssues
        }
        if (data.warnings !== undefined) {
          state.warnings = data.warnings
        }
      })
      .addCase(fetchGlobalHealth.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch global health data'
      })
      .addCase(fetchServiceHealth.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload
        if (data.services && Array.isArray(data.services)) {
          state.services = data.services
        }
      })
      .addCase(fetchServiceHealth.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch service health data'
      })
      .addCase(restartService.fulfilled, (state, action) => {
        // Update service status to indicate restart in progress
        const service = state.services.find(s => s.name === action.payload.serviceName)
        if (service) {
          service.status = 'unknown'
          service.lastCheck = new Date().toISOString()
        }
      })
      .addCase(restartService.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to restart service'
      })
  },
})

export const {
  setAutoRefresh,
  setRefreshInterval,
  updateServiceStatus,
  updateSystemMetrics,
  clearError,
  addService,
  removeService,
} = globalHealthSlice.actions

export default globalHealthSlice.reducer

// Selectors
export const selectOverallStatus = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.overallStatus
export const selectServices = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.services
export const selectHealthScore = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.healthScore
export const selectCriticalIssues = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.criticalIssues
export const selectWarnings = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.warnings
export const selectSystemMetrics = (state: { globalHealth: GlobalHealthState }) => ({
  systemLoad: state.globalHealth.systemLoad,
  memoryUsage: state.globalHealth.memoryUsage,
  diskUsage: state.globalHealth.diskUsage
})
export const selectGlobalHealthLoading = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.loading
export const selectGlobalHealthError = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.error
export const selectAutoRefresh = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.autoRefresh
export const selectRefreshInterval = (state: { globalHealth: GlobalHealthState }) => state.globalHealth.refreshInterval