import { Middleware, isRejectedWithValue } from '@reduxjs/toolkit'
import { RootState, AppDispatch } from '../index'

interface ApiErrorInfo {
  endpoint: string
  method: string
  timestamp: string
  retryCount: number
  lastError: string
}

interface ApiMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  errorsByEndpoint: Map<string, number>
  recentErrors: ApiErrorInfo[]
}

class ApiManager {
  private metrics: ApiMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    errorsByEndpoint: new Map(),
    recentErrors: []
  }

  private requestTimestamps: Map<string, number> = new Map()
  private retryQueues: Map<string, number> = new Map()
  private maxRetryAttempts: number = 3
  private retryDelay: number = 2000

  // Track request start
  trackRequestStart(requestId: string) {
    this.requestTimestamps.set(requestId, Date.now())
    this.metrics.totalRequests++
  }

  // Track request completion
  trackRequestSuccess(requestId: string) {
    const startTime = this.requestTimestamps.get(requestId)
    if (startTime) {
      const duration = Date.now() - startTime
      this.updateAverageResponseTime(duration)
      this.requestTimestamps.delete(requestId)
    }
    this.metrics.successfulRequests++
  }

  // Track request failure
  trackRequestFailure(requestId: string, endpoint: string, error: string) {
    const startTime = this.requestTimestamps.get(requestId)
    if (startTime) {
      const duration = Date.now() - startTime
      this.updateAverageResponseTime(duration)
      this.requestTimestamps.delete(requestId)
    }

    this.metrics.failedRequests++

    // Track errors by endpoint
    const currentCount = this.metrics.errorsByEndpoint.get(endpoint) || 0
    this.metrics.errorsByEndpoint.set(endpoint, currentCount + 1)

    // Add to recent errors
    const errorInfo: ApiErrorInfo = {
      endpoint,
      method: 'GET', // Default, could be enhanced to track actual method
      timestamp: new Date().toISOString(),
      retryCount: this.retryQueues.get(requestId) || 0,
      lastError: error
    }

    this.metrics.recentErrors.unshift(errorInfo)

    // Keep only last 20 errors
    if (this.metrics.recentErrors.length > 20) {
      this.metrics.recentErrors = this.metrics.recentErrors.slice(0, 20)
    }
  }

  private updateAverageResponseTime(newDuration: number) {
    const totalSuccessful = this.metrics.successfulRequests
    if (totalSuccessful === 1) {
      this.metrics.averageResponseTime = newDuration
    } else {
      // Running average calculation
      const currentAvg = this.metrics.averageResponseTime
      this.metrics.averageResponseTime = Math.round(
        (currentAvg * (totalSuccessful - 1) + newDuration) / totalSuccessful
      )
    }
  }

  // Get metrics for monitoring
  getMetrics(): ApiMetrics {
    return { ...this.metrics }
  }

  // Check if endpoint should be retried
  shouldRetry(requestId: string): boolean {
    const retryCount = this.retryQueues.get(requestId) || 0
    return retryCount < this.maxRetryAttempts
  }

  // Increment retry counter
  incrementRetry(requestId: string) {
    const currentRetries = this.retryQueues.get(requestId) || 0
    this.retryQueues.set(requestId, currentRetries + 1)
  }

  // Clear retry counter
  clearRetry(requestId: string) {
    this.retryQueues.delete(requestId)
  }

  // Calculate health score based on success rate
  getHealthScore(): number {
    const total = this.metrics.totalRequests
    if (total === 0) return 100

    const successRate = (this.metrics.successfulRequests / total) * 100
    return Math.round(successRate)
  }

  // Get error rate for specific endpoint
  getEndpointErrorRate(endpoint: string): number {
    const errors = this.metrics.errorsByEndpoint.get(endpoint) || 0
    const total = this.metrics.totalRequests
    if (total === 0) return 0

    return Math.round((errors / total) * 100)
  }

  // Check if endpoint is experiencing issues
  isEndpointHealthy(endpoint: string): boolean {
    const errorRate = this.getEndpointErrorRate(endpoint)
    const recentErrors = this.metrics.recentErrors
      .filter(e => e.endpoint === endpoint)
      .filter(e => {
        const errorTime = new Date(e.timestamp).getTime()
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
        return errorTime > fiveMinutesAgo
      })

    // Consider unhealthy if error rate > 20% or more than 3 errors in last 5 minutes
    return errorRate <= 20 && recentErrors.length <= 3
  }

  // Reset metrics (useful for testing or periodic cleanup)
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errorsByEndpoint: new Map(),
      recentErrors: []
    }
    this.requestTimestamps.clear()
    this.retryQueues.clear()
  }
}

// Global API manager instance
const apiManager = new ApiManager()

// Helper function to extract endpoint from action
function extractEndpoint(action: any): string {
  if (action.meta?.arg?.endpoint) {
    return action.meta.arg.endpoint
  }

  // Extract from action type
  const actionType = action.type
  if (actionType.includes('constraints')) return '/api/violations'
  if (actionType.includes('globalHealth')) return '/api/health/global'
  if (actionType.includes('projects')) return '/api/projects'
  if (actionType.includes('apiCost')) return '/api/costs'
  if (actionType.includes('lslWindow')) return '/api/lsl'

  return 'unknown'
}

// Helper function to generate request ID
function generateRequestId(action: any): string {
  return `${action.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// API Middleware implementation
export const apiMiddleware: Middleware<{}, RootState, AppDispatch> =
  (store) => (next) => (action) => {
    const result = next(action)

    // Track API requests
    if (action.type.endsWith('/pending')) {
      const requestId = generateRequestId(action)
      const endpoint = extractEndpoint(action)

      apiManager.trackRequestStart(requestId)

      // Store request ID in action meta for tracking
      if (action.meta) {
        action.meta.requestId = requestId
        action.meta.endpoint = endpoint
      }

      console.log(`📡 API Request started: ${endpoint}`)
    }

    // Track successful API responses
    if (action.type.endsWith('/fulfilled')) {
      const requestId = action.meta?.requestId
      const endpoint = action.meta?.endpoint || extractEndpoint(action)

      if (requestId) {
        apiManager.trackRequestSuccess(requestId)
        apiManager.clearRetry(requestId)
      }

      console.log(`✅ API Request successful: ${endpoint}`)
    }

    // Handle API errors with retry logic
    if (isRejectedWithValue(action)) {
      const requestId = action.meta?.requestId
      const endpoint = action.meta?.endpoint || extractEndpoint(action)
      const error = action.payload?.message || action.error?.message || 'Unknown error'

      if (requestId) {
        apiManager.trackRequestFailure(requestId, endpoint, error)

        // Check if we should retry
        if (apiManager.shouldRetry(requestId)) {
          apiManager.incrementRetry(requestId)

          console.warn(`⚠️ API Request failed, scheduling retry: ${endpoint} (attempt ${apiManager.retryQueues.get(requestId)}/3)`)

          // Schedule retry
          setTimeout(() => {
            // Re-dispatch the original action
            const originalAction = action.meta?.arg
            if (originalAction && action.type.includes('fetch')) {
              // Extract the async thunk and dispatch it again
              const actionCreator = action.type.replace('/rejected', '')
              store.dispatch({ type: actionCreator, ...originalAction })
            }
          }, 2000) // 2 second delay
        } else {
          console.error(`❌ API Request failed after max retries: ${endpoint}`)
          apiManager.clearRetry(requestId)
        }
      }
    }

    // Periodic metrics logging (every 100 requests)
    if (apiManager.getMetrics().totalRequests % 100 === 0 && apiManager.getMetrics().totalRequests > 0) {
      const metrics = apiManager.getMetrics()
      console.log('📊 API Metrics:', {
        requests: metrics.totalRequests,
        successRate: `${Math.round((metrics.successfulRequests / metrics.totalRequests) * 100)}%`,
        avgResponseTime: `${metrics.averageResponseTime}ms`,
        healthScore: apiManager.getHealthScore()
      })
    }

    return result
  }

// Export manager and utilities for external use
export { apiManager, ApiManager, ApiMetrics, ApiErrorInfo }

// Hook for components to access API metrics
export const useApiMetrics = () => {
  return {
    getMetrics: () => apiManager.getMetrics(),
    getHealthScore: () => apiManager.getHealthScore(),
    getEndpointErrorRate: (endpoint: string) => apiManager.getEndpointErrorRate(endpoint),
    isEndpointHealthy: (endpoint: string) => apiManager.isEndpointHealthy(endpoint),
    resetMetrics: () => apiManager.resetMetrics()
  }
}