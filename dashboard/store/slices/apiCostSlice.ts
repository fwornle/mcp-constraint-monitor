import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

// Types for API cost state
export interface ApiUsage {
  provider: string // 'anthropic', 'openai', 'grok', etc.
  service: string // 'claude-3-5-sonnet', 'gpt-4', etc.
  tokens: number
  cost: number
  requests: number
  timestamp: string
  projectName?: string
}

export interface ApiCostSummary {
  totalCost: number
  totalTokens: number
  totalRequests: number
  costByProvider: Record<string, number>
  tokensByProvider: Record<string, number>
  requestsByProvider: Record<string, number>
}

export interface BudgetAlert {
  id: string
  type: 'warning' | 'critical' | 'limit_reached'
  message: string
  threshold: number
  currentAmount: number
  timestamp: string
}

export interface ApiCostState {
  // Current period data
  currentPeriod: ApiCostSummary
  dailyUsage: ApiUsage[]
  weeklyUsage: ApiUsage[]
  monthlyUsage: ApiUsage[]

  // Budget and limits
  dailyBudget: number
  weeklyBudget: number
  monthlyBudget: number
  budgetAlerts: BudgetAlert[]

  // Real-time tracking
  currentSessionCost: number
  currentSessionTokens: number
  lastApiCall: string | null

  // Cost optimization
  costPerToken: Record<string, number> // provider -> cost per token
  recommendedProvider: string | null
  estimatedMonthlyCost: number

  // UI state
  loading: boolean
  error: string | null
  lastUpdate: number
  trackingEnabled: boolean
  alertsEnabled: boolean

  // Periods and timeframes
  selectedPeriod: 'daily' | 'weekly' | 'monthly' | 'session'
  chartTimeframe: '24h' | '7d' | '30d' | '90d'
}

const initialState: ApiCostState = {
  currentPeriod: {
    totalCost: 0,
    totalTokens: 0,
    totalRequests: 0,
    costByProvider: {},
    tokensByProvider: {},
    requestsByProvider: {}
  },
  dailyUsage: [],
  weeklyUsage: [],
  monthlyUsage: [],
  dailyBudget: 10.0, // $10 daily default
  weeklyBudget: 50.0, // $50 weekly default
  monthlyBudget: 200.0, // $200 monthly default
  budgetAlerts: [],
  currentSessionCost: 0,
  currentSessionTokens: 0,
  lastApiCall: null,
  costPerToken: {
    'anthropic': 0.000015, // Claude 3.5 Sonnet approximate
    'openai': 0.00001, // GPT-4 approximate
    'grok': 0.000005 // X.ai Grok approximate
  },
  recommendedProvider: null,
  estimatedMonthlyCost: 0,
  loading: false,
  error: null,
  lastUpdate: 0,
  trackingEnabled: true,
  alertsEnabled: true,
  selectedPeriod: 'daily',
  chartTimeframe: '24h'
}

// Async thunks for API calls
export const fetchApiCosts = createAsyncThunk(
  'apiCost/fetchCosts',
  async ({ period }: { period: 'daily' | 'weekly' | 'monthly' }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/costs/${period}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const fetchCurrentSessionCost = createAsyncThunk(
  'apiCost/fetchSession',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/costs/session`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const setBudgetLimits = createAsyncThunk(
  'apiCost/setBudgets',
  async ({
    dailyBudget,
    weeklyBudget,
    monthlyBudget
  }: {
    dailyBudget: number
    weeklyBudget: number
    monthlyBudget: number
  }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/costs/budgets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dailyBudget, weeklyBudget, monthlyBudget }),
    })

    if (!response.ok) {
      throw new Error(`Failed to set budgets: ${response.statusText}`)
    }

    return { dailyBudget, weeklyBudget, monthlyBudget }
  }
)

export const logApiUsage = createAsyncThunk(
  'apiCost/logUsage',
  async (usage: Omit<ApiUsage, 'timestamp'>) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/costs/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...usage,
        timestamp: new Date().toISOString()
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to log API usage: ${response.statusText}`)
    }

    return usage
  }
)

const apiCostSlice = createSlice({
  name: 'apiCost',
  initialState,
  reducers: {
    // Synchronous actions for UI updates
    setSelectedPeriod: (state, action: PayloadAction<'daily' | 'weekly' | 'monthly' | 'session'>) => {
      state.selectedPeriod = action.payload
    },

    setChartTimeframe: (state, action: PayloadAction<'24h' | '7d' | '30d' | '90d'>) => {
      state.chartTimeframe = action.payload
    },

    setTrackingEnabled: (state, action: PayloadAction<boolean>) => {
      state.trackingEnabled = action.payload
    },

    setAlertsEnabled: (state, action: PayloadAction<boolean>) => {
      state.alertsEnabled = action.payload
    },

    addApiUsage: (state, action: PayloadAction<ApiUsage>) => {
      const usage = action.payload

      // Add to appropriate usage array based on timestamp
      state.dailyUsage.unshift(usage)

      // Update current session
      state.currentSessionCost += usage.cost
      state.currentSessionTokens += usage.tokens
      state.lastApiCall = usage.timestamp

      // Update current period summary
      state.currentPeriod.totalCost += usage.cost
      state.currentPeriod.totalTokens += usage.tokens
      state.currentPeriod.totalRequests += usage.requests

      // Update by provider
      state.currentPeriod.costByProvider[usage.provider] =
        (state.currentPeriod.costByProvider[usage.provider] || 0) + usage.cost
      state.currentPeriod.tokensByProvider[usage.provider] =
        (state.currentPeriod.tokensByProvider[usage.provider] || 0) + usage.tokens
      state.currentPeriod.requestsByProvider[usage.provider] =
        (state.currentPeriod.requestsByProvider[usage.provider] || 0) + usage.requests

      // Check for budget alerts
      if (state.alertsEnabled) {
        if (state.currentPeriod.totalCost > state.dailyBudget * 0.8 &&
            state.currentPeriod.totalCost < state.dailyBudget) {
          state.budgetAlerts.push({
            id: `daily-warning-${Date.now()}`,
            type: 'warning',
            message: `Daily budget 80% reached: $${state.currentPeriod.totalCost.toFixed(2)} of $${state.dailyBudget}`,
            threshold: state.dailyBudget * 0.8,
            currentAmount: state.currentPeriod.totalCost,
            timestamp: new Date().toISOString()
          })
        }

        if (state.currentPeriod.totalCost >= state.dailyBudget) {
          state.budgetAlerts.push({
            id: `daily-limit-${Date.now()}`,
            type: 'limit_reached',
            message: `Daily budget limit reached: $${state.currentPeriod.totalCost.toFixed(2)}`,
            threshold: state.dailyBudget,
            currentAmount: state.currentPeriod.totalCost,
            timestamp: new Date().toISOString()
          })
        }
      }

      // Estimate monthly cost based on current usage
      const dayOfMonth = new Date().getDate()
      const averageDailyCost = state.currentPeriod.totalCost
      state.estimatedMonthlyCost = averageDailyCost * 30
    },

    dismissAlert: (state, action: PayloadAction<string>) => {
      state.budgetAlerts = state.budgetAlerts.filter(alert => alert.id !== action.payload)
    },

    clearSessionData: (state) => {
      state.currentSessionCost = 0
      state.currentSessionTokens = 0
      state.lastApiCall = null
    },

    updateCostPerToken: (state, action: PayloadAction<{ provider: string; cost: number }>) => {
      state.costPerToken[action.payload.provider] = action.payload.cost
    },

    setRecommendedProvider: (state, action: PayloadAction<string | null>) => {
      state.recommendedProvider = action.payload
    },

    clearError: (state) => {
      state.error = null
    }
  },

  extraReducers: (builder) => {
    // Handle async thunk actions
    builder
      .addCase(fetchApiCosts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchApiCosts.fulfilled, (state, action) => {
        state.loading = false
        state.lastUpdate = Date.now()

        const data = action.payload.data || action.payload

        if (data.summary) {
          state.currentPeriod = data.summary
        }
        if (data.usage && Array.isArray(data.usage)) {
          // Update appropriate usage array based on meta.period
          const period = action.meta.arg.period
          if (period === 'daily') {
            state.dailyUsage = data.usage
          } else if (period === 'weekly') {
            state.weeklyUsage = data.usage
          } else if (period === 'monthly') {
            state.monthlyUsage = data.usage
          }
        }
      })
      .addCase(fetchApiCosts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch API costs'
      })
      .addCase(fetchCurrentSessionCost.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.sessionCost !== undefined) {
          state.currentSessionCost = data.sessionCost
        }
        if (data.sessionTokens !== undefined) {
          state.currentSessionTokens = data.sessionTokens
        }
        if (data.lastApiCall) {
          state.lastApiCall = data.lastApiCall
        }
      })
      .addCase(setBudgetLimits.fulfilled, (state, action) => {
        state.dailyBudget = action.payload.dailyBudget
        state.weeklyBudget = action.payload.weeklyBudget
        state.monthlyBudget = action.payload.monthlyBudget
      })
      .addCase(setBudgetLimits.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to set budget limits'
      })
      .addCase(logApiUsage.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to log API usage'
      })
  },
})

export const {
  setSelectedPeriod,
  setChartTimeframe,
  setTrackingEnabled,
  setAlertsEnabled,
  addApiUsage,
  dismissAlert,
  clearSessionData,
  updateCostPerToken,
  setRecommendedProvider,
  clearError,
} = apiCostSlice.actions

export default apiCostSlice.reducer

// Selectors
export const selectCurrentPeriod = (state: { apiCost: ApiCostState }) => state.apiCost.currentPeriod
export const selectDailyUsage = (state: { apiCost: ApiCostState }) => state.apiCost.dailyUsage
export const selectWeeklyUsage = (state: { apiCost: ApiCostState }) => state.apiCost.weeklyUsage
export const selectMonthlyUsage = (state: { apiCost: ApiCostState }) => state.apiCost.monthlyUsage
export const selectBudgets = (state: { apiCost: ApiCostState }) => ({
  daily: state.apiCost.dailyBudget,
  weekly: state.apiCost.weeklyBudget,
  monthly: state.apiCost.monthlyBudget
})
export const selectBudgetAlerts = (state: { apiCost: ApiCostState }) => state.apiCost.budgetAlerts
export const selectCurrentSession = (state: { apiCost: ApiCostState }) => ({
  cost: state.apiCost.currentSessionCost,
  tokens: state.apiCost.currentSessionTokens,
  lastCall: state.apiCost.lastApiCall
})
export const selectCostPerToken = (state: { apiCost: ApiCostState }) => state.apiCost.costPerToken
export const selectRecommendedProvider = (state: { apiCost: ApiCostState }) => state.apiCost.recommendedProvider
export const selectEstimatedMonthlyCost = (state: { apiCost: ApiCostState }) => state.apiCost.estimatedMonthlyCost
export const selectApiCostLoading = (state: { apiCost: ApiCostState }) => state.apiCost.loading
export const selectApiCostError = (state: { apiCost: ApiCostState }) => state.apiCost.error
export const selectTrackingEnabled = (state: { apiCost: ApiCostState }) => state.apiCost.trackingEnabled
export const selectAlertsEnabled = (state: { apiCost: ApiCostState }) => state.apiCost.alertsEnabled
export const selectSelectedPeriod = (state: { apiCost: ApiCostState }) => state.apiCost.selectedPeriod
export const selectChartTimeframe = (state: { apiCost: ApiCostState }) => state.apiCost.chartTimeframe