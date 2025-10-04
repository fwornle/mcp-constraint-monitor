import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

// Types for LSL window state
export interface LslSession {
  id: string
  project: string
  startTime: string
  endTime?: string
  status: 'active' | 'completed' | 'interrupted'
  filePath: string
  size: number // in bytes
  entryCount: number
  lastActivity: string
}

export interface LslMetrics {
  totalSessions: number
  activeSessions: number
  totalEntries: number
  totalSize: number // in bytes
  averageSessionDuration: number // in minutes
  sessionsToday: number
  entriesPerHour: number
}

export interface LslAlert {
  id: string
  type: 'warning' | 'error' | 'info'
  message: string
  timestamp: string
  sessionId?: string
  resolved: boolean
}

export interface LslWindowState {
  // Current session tracking
  currentSession: LslSession | null
  recentSessions: LslSession[]

  // Metrics and analytics
  metrics: LslMetrics
  alerts: LslAlert[]

  // Window management
  windowOpen: boolean
  windowPosition: { x: number; y: number }
  windowSize: { width: number; height: number }
  pinned: boolean
  minimized: boolean

  // Display preferences
  showMetrics: boolean
  showAlerts: boolean
  showRecentSessions: boolean
  autoScroll: boolean
  refreshInterval: number // seconds

  // Filtering and search
  filterProject: string | null
  searchTerm: string
  dateRange: {
    start: string | null
    end: string | null
  }

  // UI state
  loading: boolean
  error: string | null
  lastUpdate: number

  // Real-time updates
  liveUpdates: boolean
  lastEntryTime: string | null
  newEntriesCount: number
}

const initialState: LslWindowState = {
  currentSession: null,
  recentSessions: [],
  metrics: {
    totalSessions: 0,
    activeSessions: 0,
    totalEntries: 0,
    totalSize: 0,
    averageSessionDuration: 0,
    sessionsToday: 0,
    entriesPerHour: 0
  },
  alerts: [],
  windowOpen: false,
  windowPosition: { x: 100, y: 100 },
  windowSize: { width: 400, height: 300 },
  pinned: false,
  minimized: false,
  showMetrics: true,
  showAlerts: true,
  showRecentSessions: true,
  autoScroll: true,
  refreshInterval: 5,
  filterProject: null,
  searchTerm: '',
  dateRange: {
    start: null,
    end: null
  },
  loading: false,
  error: null,
  lastUpdate: 0,
  liveUpdates: true,
  lastEntryTime: null,
  newEntriesCount: 0
}

// Async thunks for API calls
export const fetchLslStatus = createAsyncThunk(
  'lslWindow/fetchStatus',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/lsl/status`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const fetchLslSessions = createAsyncThunk(
  'lslWindow/fetchSessions',
  async ({ project, limit = 10 }: { project?: string; limit?: number } = {}) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const params = new URLSearchParams()
    if (project) params.append('project', project)
    params.append('limit', limit.toString())

    const response = await fetch(`${baseUrl}/api/lsl/sessions?${params}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const startLslSession = createAsyncThunk(
  'lslWindow/startSession',
  async ({ project }: { project: string }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/lsl/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project }),
    })

    if (!response.ok) {
      throw new Error(`Failed to start LSL session: ${response.statusText}`)
    }

    return response.json()
  }
)

export const stopLslSession = createAsyncThunk(
  'lslWindow/stopSession',
  async ({ sessionId }: { sessionId: string }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/lsl/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      throw new Error(`Failed to stop LSL session: ${response.statusText}`)
    }

    return response.json()
  }
)

export const fetchLslMetrics = createAsyncThunk(
  'lslWindow/fetchMetrics',
  async ({ timeframe = '24h' }: { timeframe?: '1h' | '24h' | '7d' | '30d' } = {}) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/lsl/metrics?timeframe=${timeframe}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

const lslWindowSlice = createSlice({
  name: 'lslWindow',
  initialState,
  reducers: {
    // Window management
    setWindowOpen: (state, action: PayloadAction<boolean>) => {
      state.windowOpen = action.payload
    },

    setWindowPosition: (state, action: PayloadAction<{ x: number; y: number }>) => {
      state.windowPosition = action.payload
    },

    setWindowSize: (state, action: PayloadAction<{ width: number; height: number }>) => {
      state.windowSize = action.payload
    },

    setPinned: (state, action: PayloadAction<boolean>) => {
      state.pinned = action.payload
    },

    setMinimized: (state, action: PayloadAction<boolean>) => {
      state.minimized = action.payload
    },

    // Display preferences
    setShowMetrics: (state, action: PayloadAction<boolean>) => {
      state.showMetrics = action.payload
    },

    setShowAlerts: (state, action: PayloadAction<boolean>) => {
      state.showAlerts = action.payload
    },

    setShowRecentSessions: (state, action: PayloadAction<boolean>) => {
      state.showRecentSessions = action.payload
    },

    setAutoScroll: (state, action: PayloadAction<boolean>) => {
      state.autoScroll = action.payload
    },

    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.refreshInterval = Math.max(1, action.payload) // Minimum 1 second
    },

    setLiveUpdates: (state, action: PayloadAction<boolean>) => {
      state.liveUpdates = action.payload
    },

    // Filtering and search
    setFilterProject: (state, action: PayloadAction<string | null>) => {
      state.filterProject = action.payload
    },

    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload
    },

    setDateRange: (state, action: PayloadAction<{ start: string | null; end: string | null }>) => {
      state.dateRange = action.payload
    },

    // Session updates
    updateCurrentSession: (state, action: PayloadAction<LslSession>) => {
      state.currentSession = action.payload
      state.lastEntryTime = action.payload.lastActivity

      // Update in recent sessions list if it exists
      const index = state.recentSessions.findIndex(s => s.id === action.payload.id)
      if (index >= 0) {
        state.recentSessions[index] = action.payload
      }
    },

    addNewEntry: (state, action: PayloadAction<{ sessionId: string; entryTime: string }>) => {
      state.newEntriesCount += 1
      state.lastEntryTime = action.payload.entryTime

      // Update current session entry count if it matches
      if (state.currentSession && state.currentSession.id === action.payload.sessionId) {
        state.currentSession.entryCount += 1
        state.currentSession.lastActivity = action.payload.entryTime
      }
    },

    clearNewEntriesCount: (state) => {
      state.newEntriesCount = 0
    },

    // Alerts management
    addAlert: (state, action: PayloadAction<Omit<LslAlert, 'id' | 'timestamp' | 'resolved'>>) => {
      const alert: LslAlert = {
        ...action.payload,
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        resolved: false
      }
      state.alerts.unshift(alert) // Add to beginning for newest first

      // Keep only last 20 alerts
      if (state.alerts.length > 20) {
        state.alerts = state.alerts.slice(0, 20)
      }
    },

    resolveAlert: (state, action: PayloadAction<string>) => {
      const alert = state.alerts.find(a => a.id === action.payload)
      if (alert) {
        alert.resolved = true
      }
    },

    removeAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter(a => a.id !== action.payload)
    },

    clearResolvedAlerts: (state) => {
      state.alerts = state.alerts.filter(a => !a.resolved)
    },

    clearError: (state) => {
      state.error = null
    }
  },

  extraReducers: (builder) => {
    // Handle async thunk actions
    builder
      .addCase(fetchLslStatus.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchLslStatus.fulfilled, (state, action) => {
        state.loading = false
        state.lastUpdate = Date.now()

        const data = action.payload.data || action.payload

        if (data.currentSession) {
          state.currentSession = data.currentSession
        }
        if (data.metrics) {
          state.metrics = { ...state.metrics, ...data.metrics }
        }
      })
      .addCase(fetchLslStatus.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch LSL status'
      })
      .addCase(fetchLslSessions.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.sessions && Array.isArray(data.sessions)) {
          state.recentSessions = data.sessions
        }
      })
      .addCase(fetchLslSessions.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch LSL sessions'
      })
      .addCase(startLslSession.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.session) {
          state.currentSession = data.session
          // Add to recent sessions
          state.recentSessions.unshift(data.session)
        }
      })
      .addCase(startLslSession.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to start LSL session'
      })
      .addCase(stopLslSession.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.sessionId && state.currentSession?.id === data.sessionId) {
          if (state.currentSession) {
            state.currentSession.status = 'completed'
            state.currentSession.endTime = new Date().toISOString()
          }
        }
      })
      .addCase(stopLslSession.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to stop LSL session'
      })
      .addCase(fetchLslMetrics.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.metrics) {
          state.metrics = { ...state.metrics, ...data.metrics }
        }
      })
      .addCase(fetchLslMetrics.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch LSL metrics'
      })
  },
})

export const {
  setWindowOpen,
  setWindowPosition,
  setWindowSize,
  setPinned,
  setMinimized,
  setShowMetrics,
  setShowAlerts,
  setShowRecentSessions,
  setAutoScroll,
  setRefreshInterval,
  setLiveUpdates,
  setFilterProject,
  setSearchTerm,
  setDateRange,
  updateCurrentSession,
  addNewEntry,
  clearNewEntriesCount,
  addAlert,
  resolveAlert,
  removeAlert,
  clearResolvedAlerts,
  clearError,
} = lslWindowSlice.actions

export default lslWindowSlice.reducer

// Selectors
export const selectCurrentSession = (state: { lslWindow: LslWindowState }) => state.lslWindow.currentSession
export const selectRecentSessions = (state: { lslWindow: LslWindowState }) => state.lslWindow.recentSessions
export const selectLslMetrics = (state: { lslWindow: LslWindowState }) => state.lslWindow.metrics
export const selectLslAlerts = (state: { lslWindow: LslWindowState }) => state.lslWindow.alerts
export const selectWindowState = (state: { lslWindow: LslWindowState }) => ({
  open: state.lslWindow.windowOpen,
  position: state.lslWindow.windowPosition,
  size: state.lslWindow.windowSize,
  pinned: state.lslWindow.pinned,
  minimized: state.lslWindow.minimized
})
export const selectDisplayPreferences = (state: { lslWindow: LslWindowState }) => ({
  showMetrics: state.lslWindow.showMetrics,
  showAlerts: state.lslWindow.showAlerts,
  showRecentSessions: state.lslWindow.showRecentSessions,
  autoScroll: state.lslWindow.autoScroll,
  refreshInterval: state.lslWindow.refreshInterval,
  liveUpdates: state.lslWindow.liveUpdates
})
export const selectFilters = (state: { lslWindow: LslWindowState }) => ({
  project: state.lslWindow.filterProject,
  searchTerm: state.lslWindow.searchTerm,
  dateRange: state.lslWindow.dateRange
})
export const selectNewEntriesCount = (state: { lslWindow: LslWindowState }) => state.lslWindow.newEntriesCount
export const selectLastEntryTime = (state: { lslWindow: LslWindowState }) => state.lslWindow.lastEntryTime
export const selectLslWindowLoading = (state: { lslWindow: LslWindowState }) => state.lslWindow.loading
export const selectLslWindowError = (state: { lslWindow: LslWindowState }) => state.lslWindow.error

// Derived selectors
export const selectUnresolvedAlerts = (state: { lslWindow: LslWindowState }) => {
  return state.lslWindow.alerts.filter(alert => !alert.resolved)
}

export const selectActiveSessionsCount = (state: { lslWindow: LslWindowState }) => {
  return state.lslWindow.recentSessions.filter(session => session.status === 'active').length
}

export const selectFilteredSessions = (state: { lslWindow: LslWindowState }) => {
  let sessions = state.lslWindow.recentSessions

  // Filter by project
  if (state.lslWindow.filterProject) {
    sessions = sessions.filter(session => session.project === state.lslWindow.filterProject)
  }

  // Filter by search term
  if (state.lslWindow.searchTerm) {
    const term = state.lslWindow.searchTerm.toLowerCase()
    sessions = sessions.filter(session =>
      session.project.toLowerCase().includes(term) ||
      session.filePath.toLowerCase().includes(term)
    )
  }

  // Filter by date range
  if (state.lslWindow.dateRange.start || state.lslWindow.dateRange.end) {
    sessions = sessions.filter(session => {
      const sessionDate = new Date(session.startTime)
      const start = state.lslWindow.dateRange.start ? new Date(state.lslWindow.dateRange.start) : null
      const end = state.lslWindow.dateRange.end ? new Date(state.lslWindow.dateRange.end) : null

      if (start && sessionDate < start) return false
      if (end && sessionDate > end) return false
      return true
    })
  }

  return sessions
}