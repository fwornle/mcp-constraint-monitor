import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

// Types for constraints state
export interface Violation {
  id: string
  timestamp: string
  constraint_id: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  tool: string
  context: string
  project: string
  repository: string
  source: string
  file_path: string
  matches: number
  detected_at: string
  pattern: string
}

export interface ConstraintInfo {
  id: string
  groupId: string
  pattern: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  enabled: boolean
  suggestion?: string
}

export interface ConstraintsState {
  // Core data
  compliance: number // 0-100% compliance rate
  violations: Violation[]
  constraints: ConstraintInfo[]

  // Derived metrics
  recentViolations24h: number
  recentViolations7d: number
  violatedConstraintsCount: number

  // UI state
  loading: boolean
  error: string | null
  lastUpdate: number

  // Chart/timeline data
  timeRange: '24h' | '5d' | '1m' | '1y'
  chartData: any[] // Will be properly typed based on chart needs
}

const initialState: ConstraintsState = {
  compliance: 85,
  violations: [],
  constraints: [],
  recentViolations24h: 0,
  recentViolations7d: 0,
  violatedConstraintsCount: 0,
  loading: false,
  error: null,
  lastUpdate: 0,
  timeRange: '24h',
  chartData: [],
}

// Async thunks for API calls
export const fetchConstraintData = createAsyncThunk(
  'constraints/fetchData',
  async (project?: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const projectParam = project ? `?project=${project}&grouped=true` : '?grouped=true'

    // Fetch both violations and constraints in parallel
    const [violationsResponse, constraintsResponse] = await Promise.all([
      fetch(`${baseUrl}/api/violations${projectParam}`),
      fetch(`${baseUrl}/api/constraints${projectParam}`)
    ])

    if (!violationsResponse.ok) {
      throw new Error(`Violations API error: HTTP ${violationsResponse.status}: ${violationsResponse.statusText}`)
    }
    if (!constraintsResponse.ok) {
      throw new Error(`Constraints API error: HTTP ${constraintsResponse.status}: ${constraintsResponse.statusText}`)
    }

    const violationsData = await violationsResponse.json()
    const constraintsData = await constraintsResponse.json()

    // Combine the data in the format expected by the reducer
    const violations = violationsData.data || violationsData || []

    // Extract and flatten constraints from grouped response
    let constraints = []
    if (constraintsData.data?.constraints) {
      // Flatten constraints from all groups
      constraints = constraintsData.data.constraints.flatMap((group: any) =>
        group.constraints || []
      )
    }

    return {
      violations,
      constraints
    }
  }
)

export const toggleConstraint = createAsyncThunk(
  'constraints/toggle',
  async ({ constraintId, enabled, project }: { constraintId: string; enabled: boolean; project?: string }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const projectParam = project ? `?project=${project}` : ''

    const response = await fetch(`${baseUrl}/api/constraints/${constraintId}/toggle${projectParam}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    })

    if (!response.ok) {
      throw new Error(`Failed to toggle constraint: ${response.statusText}`)
    }

    return { constraintId, enabled }
  }
)

const constraintsSlice = createSlice({
  name: 'constraints',
  initialState,
  reducers: {
    // Synchronous actions for UI updates
    setTimeRange: (state, action: PayloadAction<'24h' | '5d' | '1m' | '1y'>) => {
      state.timeRange = action.payload
    },

    updateCompliance: (state, action: PayloadAction<number>) => {
      state.compliance = Math.max(0, Math.min(100, action.payload))
    },

    addViolation: (state, action: PayloadAction<Violation>) => {
      state.violations.unshift(action.payload) // Add to beginning for newest first
      // Recalculate metrics
      const now = Date.now()
      const cutoff24h = now - (24 * 60 * 60 * 1000)
      const cutoff7d = now - (7 * 24 * 60 * 60 * 1000)

      state.recentViolations24h = state.violations.filter(v =>
        new Date(v.timestamp).getTime() > cutoff24h
      ).length

      state.recentViolations7d = state.violations.filter(v =>
        new Date(v.timestamp).getTime() > cutoff7d
      ).length

      state.violatedConstraintsCount = new Set(
        state.violations
          .filter(v => new Date(v.timestamp).getTime() > cutoff24h)
          .map(v => v.constraint_id)
      ).size
    },

    clearViolations: (state) => {
      state.violations = []
      state.recentViolations24h = 0
      state.recentViolations7d = 0
      state.violatedConstraintsCount = 0
    },

    updateChartData: (state, action: PayloadAction<any[]>) => {
      state.chartData = action.payload
    },

    clearError: (state) => {
      state.error = null
    },
  },

  extraReducers: (builder) => {
    // Handle async thunk actions
    builder
      .addCase(fetchConstraintData.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchConstraintData.fulfilled, (state, action) => {
        state.loading = false
        state.lastUpdate = Date.now()

        const data = action.payload.data || action.payload

        if (data.violations) {
          state.violations = data.violations
        }
        if (data.constraints) {
          state.constraints = data.constraints
        }

        // Calculate metrics
        const now = Date.now()
        const cutoff24h = now - (24 * 60 * 60 * 1000)
        const cutoff7d = now - (7 * 24 * 60 * 60 * 1000)

        state.recentViolations24h = state.violations.filter(v =>
          new Date(v.timestamp).getTime() > cutoff24h
        ).length

        state.recentViolations7d = state.violations.filter(v =>
          new Date(v.timestamp).getTime() > cutoff7d
        ).length

        state.violatedConstraintsCount = new Set(
          state.violations
            .filter(v => new Date(v.timestamp).getTime() > cutoff24h)
            .map(v => v.constraint_id)
        ).size

        // Calculate compliance rate using the same algorithm as the dashboard
        const enabledConstraints = state.constraints.filter(c => c.enabled).length
        let complianceRate = 100

        if (enabledConstraints > 0 && state.recentViolations24h > 0) {
          const constraintPenalty = Math.min(40, (state.violatedConstraintsCount / enabledConstraints) * 40)
          const excessViolations = Math.max(0, state.recentViolations24h - state.violatedConstraintsCount)
          const volumePenalty = Math.min(20, excessViolations * 2)
          const totalPenalty = constraintPenalty + volumePenalty
          complianceRate = Math.max(0, Math.round(100 - totalPenalty))
        }

        state.compliance = complianceRate
      })
      .addCase(fetchConstraintData.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch constraint data'
      })
      .addCase(toggleConstraint.fulfilled, (state, action) => {
        const { constraintId, enabled } = action.payload
        const constraint = state.constraints.find(c => c.id === constraintId)
        if (constraint) {
          constraint.enabled = enabled
        }
      })
      .addCase(toggleConstraint.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to toggle constraint'
      })
  },
})

export const {
  setTimeRange,
  updateCompliance,
  addViolation,
  clearViolations,
  updateChartData,
  clearError,
} = constraintsSlice.actions

export default constraintsSlice.reducer

// Selectors
export const selectCompliance = (state: { constraints: ConstraintsState }) => state.constraints.compliance
export const selectViolations = (state: { constraints: ConstraintsState }) => state.constraints.violations
export const selectConstraints = (state: { constraints: ConstraintsState }) => state.constraints.constraints
export const selectRecentViolations24h = (state: { constraints: ConstraintsState }) => state.constraints.recentViolations24h
export const selectTimeRange = (state: { constraints: ConstraintsState }) => state.constraints.timeRange
export const selectChartData = (state: { constraints: ConstraintsState }) => state.constraints.chartData
export const selectConstraintsLoading = (state: { constraints: ConstraintsState }) => state.constraints.loading
export const selectConstraintsError = (state: { constraints: ConstraintsState }) => state.constraints.error