"use client"

/**
 * Constraint Dashboard Component
 * 
 * Health Monitoring System:
 * - Dashboard (port 3030): Next.js frontend serving this React component
 * - API Server (port 3031): Express.js backend providing data endpoints
 * 
 * Health Check Endpoints:
 * - Frontend health: HTTP GET http://localhost:3030/ (returns 200 if healthy)
 * - Backend health: HTTP GET http://localhost:3031/api/health (returns health status)
 * 
 * Inter-service Communication:
 * - All API calls use CONFIG.API_BASE_URL (configurable port from .env.ports)
 * - Automatic failover to defaults if centralized config unavailable
 * - Health monitoring ensures both services are operational for full functionality
 */

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, ChevronUp, ChevronRight, AlertTriangle, CheckCircle, Settings, Folder, Clock, Zap, Power, PowerOff, TrendingUp, Activity, Users, Plus, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { isAfter, subHours, subDays, subMonths, format, parseISO } from 'date-fns'
import CONFIG from '@/lib/config'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  fetchConstraintData,
  toggleConstraint as toggleConstraintAction,
  setTimeRange,
  selectCompliance,
  selectViolations,
  selectConstraints,
  selectRecentViolations24h,
  selectTimeRange,
  selectConstraintsLoading,
  selectConstraintsError
} from '@/store/slices/constraintsSlice'
import { selectProjects, selectCurrentProject, fetchProjects, setCurrentProject } from '@/store/slices/projectsSlice'
import SystemHealthIndicator from '@/components/system-health-indicator'

interface Constraint {
  id: string
  pattern: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  enabled: boolean
  groupId?: string
  suggestion?: string
}

interface ConstraintGroup {
  id: string
  name: string
  description: string
  icon: string
  color: string
  enabled: boolean
}

interface Violation {
  id: string
  constraint_id: string
  message: string
  severity: string
  timestamp: string
  tool?: string
  status: string
  source: string
  session_id?: string
  context?: string
  file_path?: string
  matches?: number
}

interface ConstraintData {
  groups: ConstraintGroup[]
  constraints: Constraint[]
  violations: Violation[]
}

interface ProjectInfo {
  name: string
  path: string
  status: string
  active: boolean
  current: boolean
  pid?: number
  startTime?: number
  lastHealthCheck?: number
  exchanges?: number
}

interface ChartDataPoint {
  time: string
  fullTime: string
  violations: number
  warning: number    // Count of warning violations
  error: number      // Count of error violations
  critical: number   // Count of critical violations
  info: number       // Count of info violations
  nowMarker: number  // Blue marker for current time interval (0 or 0.2)
  timestamp: number
  intervalTime: string
  actualTime: Date
  violationId?: string // Optional field for tracking individual violations
  isCurrentInterval?: boolean // Flag to highlight current time bin
}

export default function ConstraintDashboard() {
  // Redux state
  const dispatch = useAppDispatch()
  const compliance = useAppSelector(selectCompliance)
  const violations = useAppSelector(selectViolations)
  const constraints = useAppSelector(selectConstraints)
  const recentViolations24h = useAppSelector(selectRecentViolations24h)
  const timeRange = useAppSelector(selectTimeRange)
  const loading = useAppSelector(selectConstraintsLoading)
  const error = useAppSelector(selectConstraintsError)
  const projects = useAppSelector(selectProjects)
  const currentProject = useAppSelector(selectCurrentProject)

  // Local UI state that doesn't need to be in Redux
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [allExpanded, setAllExpanded] = useState(false)
  const [projectSwitching, setProjectSwitching] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('coding')
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [togglingConstraints, setTogglingConstraints] = useState<Set<string>>(new Set())
  const [togglingGroups, setTogglingGroups] = useState<Set<string>>(new Set())
  const [groupToggleStates, setGroupToggleStates] = useState<Record<string, boolean>>({})
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set())

  // Cycle through time ranges
  const cycleTimeRange = () => {
    const ranges: Array<'24h' | '5d' | '1m' | '1y'> = ['24h', '5d', '1m', '1y']
    const currentIndex = ranges.indexOf(timeRange)
    const nextIndex = (currentIndex + 1) % ranges.length
    dispatch(setTimeRange(ranges[nextIndex]))
  }

  // Refs for scrolling
  const violationsRef = useRef<HTMLDivElement>(null)
  const violationsListRef = useRef<HTMLDivElement>(null)
  const constraintGroupsRef = useRef<HTMLDivElement>(null)

  // Single useEffect for initial data loading
  useEffect(() => {
    console.log('[DEBUG] Initial mount - fetching projects')
    dispatch(fetchProjects())
  }, [dispatch])

  // Sync selectedProject to Redux currentProject
  useEffect(() => {
    if (selectedProject && selectedProject !== 'current') {
      console.log('[DEBUG] Syncing selectedProject to Redux:', selectedProject)
      dispatch(setCurrentProject(selectedProject))
    }
  }, [selectedProject, dispatch])

  // Single useEffect for constraint data when project or timeRange changes
  useEffect(() => {
    if (selectedProject && selectedProject !== 'current') {
      console.log('[DEBUG] Fetching constraints for project:', selectedProject, 'timeRange:', timeRange)
      setProjectSwitching(true)
      dispatch(fetchConstraintData(selectedProject)).finally(() => setProjectSwitching(false))
    }
  }, [selectedProject, timeRange, dispatch])

  // Removed automatic polling - users can manually refresh when needed
  // If continuous monitoring is required, enable middleware auto-refresh via config
  // This prevents constant unnecessary API calls and UI reloads



  const toggleConstraint = async (constraintId: string, currentEnabled: boolean) => {
    try {
      setTogglingConstraints(prev => new Set(prev).add(constraintId))

      await dispatch(toggleConstraintAction({
        constraintId,
        enabled: !currentEnabled,
        project: selectedProject
      }))

      // No refetch - Redux store already updated by toggleConstraint.fulfilled
      // Refetching loads stale data from ConstraintDetector cache (60s reload)
    } catch (err) {
      console.error('Failed to toggle constraint:', err)
      // Show error feedback - could add toast notification here
      alert(`Failed to toggle constraint: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setTogglingConstraints(prev => {
        const newSet = new Set(prev)
        newSet.delete(constraintId)
        return newSet
      })
    }
  }

  const toggleConstraintGroup = async (groupId: string, enableAll: boolean) => {
    try {
      setTogglingGroups(prev => new Set(prev).add(groupId))

      const groupConstraints = constraints?.filter(c => c.groupId === groupId) || []

      // Update group toggle state immediately for UI responsiveness
      setGroupToggleStates(prev => ({
        ...prev,
        [groupId]: enableAll
      }))

      // Toggle all constraints in the group using Redux actions
      const togglePromises = groupConstraints.map(constraint =>
        dispatch(toggleConstraintAction({
          constraintId: constraint.id,
          enabled: enableAll,
          project: selectedProject
        }))
      )

      await Promise.all(togglePromises)

      // Project-aware refresh: only refresh if still on the same project
      const currentProject = selectedProject
      setTimeout(() => {
        if (selectedProject === currentProject) {
          dispatch(fetchConstraintData(selectedProject))
        }
      }, 2000)

    } catch (err) {
      console.error('Failed to toggle group:', err)
      // Revert group toggle state if API calls failed
      setGroupToggleStates(prev => ({
        ...prev,
        [groupId]: !enableAll
      }))
      alert(`Failed to toggle group: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setTogglingGroups(prev => {
        const newSet = new Set(prev)
        newSet.delete(groupId)
        return newSet
      })
    }
  }


  const toggleAccordionGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const expandAll = () => {
    if (constraints.length > 0) {
      // Get unique group IDs from constraints
      const groupIds = [...new Set(constraints.map(c => c.groupId).filter(Boolean))]
      setExpandedGroups(groupIds)
      setAllExpanded(true)
    }
  }

  const collapseAll = () => {
    setExpandedGroups([])
    setAllExpanded(false)
  }

  const toggleExpandAll = () => {
    if (allExpanded) {
      collapseAll()
    } else {
      expandAll()
    }
  }

  // Scroll functions for UI navigation
  const scrollToViolations = () => {
    violationsRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    })
  }

  const scrollToConstraintGroups = () => {
    constraintGroupsRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  const scrollToViolationsList = () => {
    violationsListRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  const toggleViolationExpansion = (violationId: string) => {
    setExpandedViolations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(violationId)) {
        newSet.delete(violationId)
      } else {
        newSet.add(violationId)
      }
      return newSet
    })
  }

  // Helper function to get interval hours based on time range
  const getIntervalHours = () => {
    switch (timeRange) {
      case '24h': return 1 // 1-hour intervals
      case '5d': return 4  // 4-hour intervals
      case '1m': return 24 // 24-hour intervals
      case '1y': return 7 * 24 // 7-day intervals
      default: return 1
    }
  }

  // Timeline bar click handler for specific severity categories
  const handleBarClick = (data: unknown, index: number, severity: 'info' | 'warning' | 'error' | 'critical') => {
    console.log('[DEBUG] handleBarClick called with severity:', severity, 'data:', data, 'index:', index)

    // Get the chart data for this index
    const clickedData = chartData[index]
    if (!clickedData) {
      console.log('[DEBUG] No chart data found for index:', index)
      return
    }

    console.log('[DEBUG] Clicked chart data:', clickedData)
    console.log('[DEBUG] Looking for violations with severity:', severity)

    // Get interval hours for this time range
    const intervalHours = getIntervalHours()
    console.log('[DEBUG] Interval hours:', intervalHours)

    // Find violations in this time interval with matching severity
    const intervalStart = new Date(clickedData.timestamp)
    const intervalEnd = new Date(intervalStart.getTime() + (intervalHours * 60 * 60 * 1000))

    console.log('[DEBUG] Time interval:', {
      start: intervalStart.toISOString(),
      end: intervalEnd.toISOString()
    })

    const allViolations = getFilteredViolations()
    console.log('[DEBUG] Total filtered violations:', allViolations.length)

    const violationsInInterval = allViolations.filter(violation => {
      const violationTime = new Date(violation.timestamp)
      const inInterval = violationTime >= intervalStart && violationTime < intervalEnd
      const matchesSeverity = violation.severity === severity

      if (inInterval && matchesSeverity) {
        console.log('[DEBUG] Found matching violation:', violation.id, violationTime.toISOString(), 'severity:', violation.severity)
      }

      return inInterval && matchesSeverity
    })

    console.log('[DEBUG] Found', violationsInInterval.length, 'violations in clicked interval with severity:', severity)

    // Scroll to violations list
    console.log('[DEBUG] Scrolling to violations list')
    scrollToViolationsList()

    // If there are violations with this severity in this interval, expand the first one
    if (violationsInInterval.length > 0) {
      const targetViolation = violationsInInterval[0]
      console.log('[DEBUG] Target violation to expand:', {
        id: targetViolation.id,
        timestamp: targetViolation.timestamp,
        severity: targetViolation.severity,
        constraint_id: targetViolation.constraint_id
      })

      // Clear existing expansions and expand the target
      setExpandedViolations(new Set([targetViolation.id]))

      // Scroll to the specific violation after a short delay
      setTimeout(() => {
        console.log('[DEBUG] Looking for violation element with ID:', targetViolation.id)
        const violationElement = document.querySelector(`[data-violation-id="${targetViolation.id}"]`)
        console.log('[DEBUG] Found violation element:', violationElement)

        if (violationElement) {
          console.log('[DEBUG] Scrolling to violation element')
          // First scroll the parent container to make the element visible
          const scrollContainer = violationElement.closest('.overflow-y-auto')
          if (scrollContainer) {
            // Calculate position of element relative to container
            const elementRect = violationElement.getBoundingClientRect()
            const containerRect = scrollContainer.getBoundingClientRect()
            const relativeTop = elementRect.top - containerRect.top + scrollContainer.scrollTop

            // Scroll container to center the element
            scrollContainer.scrollTo({
              top: relativeTop - scrollContainer.clientHeight / 2 + violationElement.clientHeight / 2,
              behavior: 'smooth'
            })
          } else {
            // Fallback to standard scrollIntoView
            violationElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        } else {
          console.log('[DEBUG] Violation element not found!')
        }
      }, 500)
    } else {
      console.log('[DEBUG] No violations found in the clicked interval with severity:', severity)

      // Still scroll to violations list and show a general message
      // Let's find any violations in the interval regardless of severity to provide feedback
      const anyViolationsInInterval = allViolations.filter(violation => {
        const violationTime = new Date(violation.timestamp)
        return violationTime >= intervalStart && violationTime < intervalEnd
      })

      if (anyViolationsInInterval.length > 0) {
        console.log('[DEBUG] Found', anyViolationsInInterval.length, 'violations in interval but with different severities')
        const severityCounts = anyViolationsInInterval.reduce((acc, v) => {
          acc[v.severity] = (acc[v.severity] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        console.log('[DEBUG] Severity breakdown:', severityCounts)
      }
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600'     // Dark red - very distinct
      case 'error': return 'bg-orange-500'    // Orange - clearly different from red
      case 'warning': return 'bg-yellow-400'  // Yellow/amber - unchanged
      case 'info': return 'bg-sky-300'        // Light blue - distinct from "now" indicator
      default: return 'bg-gray-400'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error': return <AlertTriangle className="h-4 w-4" />
      case 'warning': return <AlertTriangle className="h-4 w-4" />
      case 'info': return <CheckCircle className="h-4 w-4" />
      default: return <Settings className="h-4 w-4" />
    }
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now.getTime() - time.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays}d ago`
    if (diffHours > 0) return `${diffHours}h ago`
    if (diffMins > 0) return `${diffMins}m ago`
    return 'Just now'
  }

  const formatTimestamp = (timestamp: string) => {
    const time = new Date(timestamp)
    return time.toLocaleString() // Uses local timezone automatically
  }

  const getGroupStats = (groupId: string) => {
    if (!constraints.length) return { total: 0, enabled: 0, violations: 0 }

    const groupConstraints = constraints?.filter(c => c.groupId === groupId) || []
    const recentViolations = getRecentViolations(24) // Only violations from last 24 hours
    const groupViolations = recentViolations.filter(v =>
      groupConstraints.some(c => c.id === v.constraint_id)
    )

    return {
      total: groupConstraints.length,
      enabled: groupConstraints.filter(c => c.enabled).length,
      violations: groupViolations.length
    }
  }

  // Helper function to get violations within specified hours
  const getRecentViolations = (hours: number) => {
    if (!violations?.length) return []
    const cutoff = subHours(new Date(), hours)
    return violations.filter(v => {
      try {
        const violationTime = parseISO(v.timestamp)
        return isAfter(violationTime, cutoff)
      } catch {
        return false
      }
    })
  }

  // Get violations based on selected time range, sorted by timestamp (newest first) and severity (most severe first as secondary)
  const getFilteredViolations = () => {
    if (!violations) {
      throw new Error('Violations data not loaded - violations is missing')
    }

    console.log('[DEBUG] getFilteredViolations - timeRange:', timeRange, 'violations.length:', violations.length)

    if (!violations.length) return []

    const now = new Date()
    let cutoff: Date
    let filteredViolations = violations

    // Apply time filter first
    switch (timeRange) {
      case '24h':
        cutoff = subHours(now, 24)
        break
      case '5d':
        cutoff = subDays(now, 5)
        break
      case '1m':
        cutoff = subMonths(now, 1)
        break
      case '1y':
        console.log('[DEBUG] timeRange=1y, returning all', violations.length, 'violations')
        // Don't filter by time for 1y, but still apply sorting below
        break
      default:
        break
    }

    // Filter by time range if not 1y
    if (timeRange !== '1y') {
      filteredViolations = violations.filter(v => {
        try {
          const violationTime = parseISO(v.timestamp)
          return isAfter(violationTime, cutoff)
        } catch {
          return false
        }
      })
    }

    // Sort by timestamp (newest first, seconds granularity) and severity (most severe first as secondary key)
    const severityOrder = { critical: 3, error: 2, warning: 1, info: 0 }

    return [...filteredViolations].sort((a, b) => {
      // Primary sort: timestamp at seconds granularity (newest first)
      const timeA = Math.floor(new Date(a.timestamp).getTime() / 1000) // Convert to seconds
      const timeB = Math.floor(new Date(b.timestamp).getTime() / 1000) // Convert to seconds
      if (timeB !== timeA) {
        return timeB - timeA // Descending order (newest first)
      }

      // Secondary sort: severity (most severe first within same second)
      const severityA = severityOrder[a.severity as keyof typeof severityOrder] || 0
      const severityB = severityOrder[b.severity as keyof typeof severityOrder] || 0
      return severityB - severityA // Descending order (critical, error, warning, info)
    })
  }

  // Generate chart data for violations timeline - midnight-based with exact violation times as bars
  const getViolationsChartData = () => {
    const now = new Date()

    // Determine timeline based on selected range
    let timelineHours: number
    let intervalHours: number

    switch (timeRange) {
      case '24h':
        timelineHours = 24
        intervalHours = 1 // 1-hour intervals for 24h view
        break
      case '5d':
        timelineHours = 5 * 24 // 120 hours
        intervalHours = 4 // 4-hour intervals for 5 day view
        break
      case '1m':
        timelineHours = 30 * 24 // 720 hours
        intervalHours = 24 // 24-hour intervals for month view
        break
      case '1y':
        timelineHours = 365 * 24 // 1 year = 8760 hours
        intervalHours = 7 * 24 // 7-day intervals for year view
        break
    }

    // Find next boundary - ALWAYS use next midnight as the right boundary
    const nextBoundary = new Date(now)
    nextBoundary.setDate(nextBoundary.getDate() + 1)
    nextBoundary.setHours(0, 0, 0, 0)

    // Timeline extends from next boundary back by timelineHours
    const timelineStart = new Date(nextBoundary.getTime() - (timelineHours * 60 * 60 * 1000))
    const intervalCount = Math.ceil(timelineHours / intervalHours)

    console.log('[DEBUG] Timeline config - range:', timeRange, 'hours:', timelineHours, 'interval:', intervalHours, 'count:', intervalCount)
    console.log('[DEBUG] Timeline range: from', timelineStart.toISOString(), 'to', nextBoundary.toISOString())

    // Create intervals - ALWAYS return this structure
    const intervals: ChartDataPoint[] = []

    for (let i = 0; i < intervalCount; i++) {
      const intervalTime = new Date(timelineStart.getTime() + (i * intervalHours * 60 * 60 * 1000))
      const intervalEnd = new Date(intervalTime.getTime() + (intervalHours * 60 * 60 * 1000))

      // Format time labels based on interval size
      let displayLabel: string
      if (intervalHours < 24) {
        // For hourly intervals, show full hours only (never 16:02, always 16:00)
        const timeLabel = format(intervalTime, 'HH:00')
        const dateLabel = format(intervalTime, 'MMM dd')

        // Show date around midnight transitions or at regular intervals
        const hour = intervalTime.getHours()
        const showDate = (hour === 0) || (i === 0) || (i === intervalCount - 1)
        displayLabel = showDate ? `${dateLabel} ${timeLabel}` : timeLabel
      } else {
        // For daily or multi-day intervals, show date with year for Dec/Jan only
        const month = intervalTime.getMonth() // 0-11, where 0=Jan, 11=Dec
        const showYear = month === 11 || month === 0 // Dec(11), Jan(0)
        displayLabel = showYear
          ? format(intervalTime, 'yyyy, MMM dd')
          : format(intervalTime, 'MMM dd')
      }

      // Check if current time falls within this interval
      const isCurrentInterval = now >= intervalTime && now < intervalEnd

      if (i === 0 || i === Math.floor(intervalCount / 2) || isCurrentInterval) {
        console.log(`[DEBUG] Interval ${i} (${displayLabel}):`, {
          intervalTime: intervalTime.toISOString(),
          intervalEnd: intervalEnd.toISOString(),
          now: now.toISOString(),
          isCurrentInterval
        })
      }

      intervals.push({
        time: displayLabel,
        fullTime: `${intervalTime.toLocaleDateString()} ${intervalTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${intervalEnd.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
        violations: 0, // Will be populated below
        warning: 0,    // Severity-based counts for stacked bars
        error: 0,
        critical: 0,
        info: 0,
        nowMarker: 0, // Will be calculated dynamically after we know max values
        timestamp: intervalTime.getTime(),
        intervalTime: intervalTime.toISOString(),
        actualTime: intervalTime,
        isCurrentInterval
      })
    }

    console.log('[DEBUG] Generated', intervals.length, `${intervalHours}h intervals for ${timelineHours}h period`)
    console.log('[DEBUG] First interval:', intervals[0])
    console.log('[DEBUG] Last interval:', intervals[intervals.length - 1])

    if (!violations) {
      console.log('[DEBUG] No violations data available, returning empty intervals')
      return intervals // Return intervals with zero violations
    }

    console.log('[DEBUG] Chart function - violations.length:', violations.length)

    if (!violations.length) {
      console.log('[DEBUG] No violations data, returning empty intervals with zero violations')
      return intervals // Return intervals with zero violations
    }

    console.log('[DEBUG] Processing', violations.length, 'violations')

    // Aggregate violations into intervals
    violations.forEach(violation => {
      try {
        const violationTime = parseISO(violation.timestamp)
        console.log('[DEBUG] Processing violation:', violation.id, 'actual time:', violationTime.toISOString())

        // Only include violations within our timeline window
        if (violationTime >= timelineStart && violationTime < nextBoundary) {
          // Find which interval this violation belongs to
          const intervalIndex = Math.floor((violationTime.getTime() - timelineStart.getTime()) / (intervalHours * 60 * 60 * 1000))

          if (intervalIndex >= 0 && intervalIndex < intervals.length) {
            intervals[intervalIndex].violations += 1

            // Count by severity for stacked bars
            const severity = violation.severity || 'warning'
            if (severity === 'critical') {
              intervals[intervalIndex].critical += 1
            } else if (severity === 'error') {
              intervals[intervalIndex].error += 1
            } else if (severity === 'warning') {
              intervals[intervalIndex].warning += 1
            } else if (severity === 'info') {
              intervals[intervalIndex].info += 1
            }

            console.log('[DEBUG] Added violation to interval', intervalIndex, 'at', intervals[intervalIndex].time, 'severity:', severity, 'total now:', intervals[intervalIndex].violations)
          }
        } else {
          console.log('[DEBUG] Violation outside timeline window:', violationTime.toISOString())
        }

      } catch (error) {
        console.warn('[DEBUG] Failed to process violation timestamp:', violation.timestamp, error)
      }
    })

    console.log('[DEBUG] Final intervals with violations:')
    intervals.forEach((interval, idx) => {
      if (interval.violations > 0) {
        console.log('[DEBUG] Interval', idx, ':', interval.fullTime, '- violations:', interval.violations)
      }
      // Force current interval to have minimal height for visibility
      if (interval.isCurrentInterval && interval.violations === 0) {
        console.log('[DEBUG] Current interval has no violations, adding minimal height for visibility')
        interval.violations = 0.1; // Minimal height to show blue bar
      }
    })

    // Calculate dynamic "now" marker height based on chart's maximum y-axis value
    const maxTotalViolations = Math.max(
      ...intervals.map(interval => interval.warning + interval.error + interval.critical + interval.info),
      4 // Minimum scale to match YAxis domain
    )

    // Set "now" marker to 4% of the maximum y-axis value for good visibility
    const nowMarkerHeight = Math.max(0.1, maxTotalViolations * 0.04)

    intervals.forEach((interval, idx) => {
      if (interval.isCurrentInterval) {
        interval.nowMarker = nowMarkerHeight
        console.log('[DEBUG] Set nowMarker for current interval', idx, 'to', nowMarkerHeight, '(4% of max', maxTotalViolations, ')')
      }
    })

    // Always return the consistent interval structure
    return intervals
  }

  // Get accurate statistics with improved compliance algorithm
  const getAccurateStats = () => {
    const recent24h = getRecentViolations(24)
    const recent7d = getRecentViolations(7 * 24)

    const totalConstraints = constraints?.length || 0
    const enabledConstraints = constraints?.filter(c => c.enabled).length || 0

    // Get unique group count from constraints
    const groupCount = constraints.length > 0 ? new Set(constraints.map(c => c.groupId).filter(Boolean)).size : 0

    return {
      totalConstraints,
      enabledConstraints,
      groupCount,
      recentViolations24h: recent24h.length,
      recentViolations7d: recent7d.length,
      complianceRate: compliance, // Use Redux state compliance value
      // Add debugging info
      violatedConstraintsCount: recent24h.length > 0 ? new Set(recent24h.map(v => v.constraint_id)).size : 0
    }
  }

  // Debug state values before render decisions
  console.log('[DEBUG] Render decision - loading:', loading, 'constraints.length:', constraints.length, 'error:', error, 'selectedProject:', selectedProject, 'projects.length:', projects.length)

  if (loading && constraints.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading constraint data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Alert variant="destructive" className="max-w-md mx-auto mt-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const stats = getAccurateStats()
  const chartData = getViolationsChartData()

  return (
    <div className="min-h-screen bg-background p-3">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Compact Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Constraint Monitor Dashboard
              {selectedProject && selectedProject !== 'current' && (
                <span className="ml-2 text-lg font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {selectedProject}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time constraint monitoring and compliance tracking with health monitoring ensuring dashboard (port 3030) and API server (port 3031) operations
              {selectedProject && selectedProject !== 'current' && (
                <span className="ml-2">
                  • Monitoring <span className="font-bold text-primary">{selectedProject}</span>
                  {selectedProject !== currentProject && (
                    <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                      Remote
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <SystemHealthIndicator />

            <Select value={selectedProject} onValueChange={setSelectedProject} disabled={projectSwitching}>
              <SelectTrigger className="w-52 min-w-40 h-8">
                <Folder className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Select project..." />
                {projectSwitching && (
                  <div className="ml-1 animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                )}
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.name} value={project.name} className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{project.name}</span>
                      {project.current && (
                        <span className="flex-shrink-0 text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`${CONFIG.API_BASE_URL}/api/health`, '_blank')}
              className="h-8 px-2"
            >
              <Activity className="h-3 w-3 mr-1" />
              API
            </Button>
          </div>
        </div>

        {/* Quick Stats with Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total Constraints</div>
            <div className="text-lg font-semibold">{stats.totalConstraints}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Enabled</div>
            <div className="text-lg font-semibold text-green-600">{stats.enabledConstraints}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Groups</div>
            <div className="text-lg font-semibold">{stats.groupCount}</div>
          </Card>
          <Card className="p-3 cursor-pointer hover:bg-accent" onClick={scrollToViolations}>
            <div className="text-xs text-muted-foreground">Violations (24h)</div>
            <div className="text-lg font-semibold text-red-600">{stats.recentViolations24h}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Compliance Rate</div>
            <div className="text-lg font-semibold text-blue-600">{stats.complianceRate}%</div>
          </Card>
          <Card className="p-3 cursor-pointer hover:bg-accent" onClick={scrollToConstraintGroups}>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Settings className="h-3 w-3" />
              Manage
            </div>
            <div className="text-sm font-medium text-primary">Configure</div>
          </Card>
        </div>

        {/* Violations Timeline Section */}
        <div ref={violationsRef}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <h2 className="text-lg font-semibold">Violations Timeline</h2>
                {violationsLoading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={timeRange === '24h' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => dispatch(setTimeRange('24h'))}
                    className="h-7 px-2"
                  >
                    24h
                  </Button>
                  <Button
                    variant={timeRange === '5d' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => dispatch(setTimeRange('5d'))}
                    className="h-7 px-2"
                  >
                    5d
                  </Button>
                  <Button
                    variant={timeRange === '1m' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => dispatch(setTimeRange('1m'))}
                    className="h-7 px-2"
                  >
                    1m
                  </Button>
                  <Button
                    variant={timeRange === '1y' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => dispatch(setTimeRange('1y'))}
                    className="h-7 px-2"
                  >
                    1y
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cycleTimeRange}
                  className="h-7 px-2 ml-2"
                  title={`Current: ${timeRange} • Click to cycle to next range`}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  {timeRange}
                </Button>
                <div className="text-sm text-muted-foreground">
                  {getFilteredViolations().length} violations
                </div>
              </div>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#666"
                    fontSize={10}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={10}
                    domain={[0, (dataMax: number) => Math.max(4, dataMax)]}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: number, name: string, props: unknown) => {
                      console.log('[DEBUG] Tooltip formatter - value:', value, 'name:', name, 'props:', props)
                      const severityLabels: { [key: string]: string } = {
                        warning: 'Warning',
                        error: 'Error',
                        critical: 'Critical'
                      }
                      return [
                        `${value} ${severityLabels[name] || name}${value !== 1 ? 's' : ''}`,
                        severityLabels[name] || name
                      ]
                    }}
                    labelFormatter={(label: unknown, payload: readonly unknown[]) => {
                      if (payload && payload.length > 0) {
                        const data = (payload[0] as { payload?: ChartDataPoint })?.payload
                        console.log('[DEBUG] Tooltip labelFormatter - payload data:', data)
                        const totalViolations = (data?.warning || 0) + (data?.error || 0) + (data?.critical || 0) + (data?.info || 0)
                        if (data?.fullTime) {
                          return `${data.fullTime} • Total: ${totalViolations} violation${totalViolations !== 1 ? 's' : ''}`
                        }
                      }
                      return `Time: ${label}`
                    }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                  {/* Stacked bars for different severity levels */}
                  <Bar
                    dataKey="info"
                    stackId="severity"
                    fill="#0ea5e9"
                    stroke="#0284c7"
                    strokeWidth={1}
                    radius={[0, 0, 0, 0]}
                    onClick={(data, index) => handleBarClick(data, index, 'info')}
                  />
                  <Bar
                    dataKey="warning"
                    stackId="severity"
                    fill="#fbbf24"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    radius={[0, 0, 0, 0]}
                    onClick={(data, index) => handleBarClick(data, index, 'warning')}
                  />
                  <Bar
                    dataKey="error"
                    stackId="severity"
                    fill="#f97316"
                    stroke="#ea580c"
                    strokeWidth={1}
                    radius={[0, 0, 0, 0]}
                    onClick={(data, index) => handleBarClick(data, index, 'error')}
                  />
                  <Bar
                    dataKey="critical"
                    stackId="severity"
                    fill="#dc2626"
                    stroke="#b91c1c"
                    strokeWidth={1}
                    radius={[2, 2, 0, 0]}
                    onClick={(data, index) => handleBarClick(data, index, 'critical')}
                  />
                  {/* Blue "now" marker - separate stack for current time indicator */}
                  <Bar
                    dataKey="nowMarker"
                    stackId="nowIndicator"
                    fill="#0066ff"
                    stroke="#0052cc"
                    strokeWidth={1}
                    radius={[1, 1, 1, 1]}
                    name="Current Time"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Recent Violations List */}
        <div ref={violationsListRef}>
          <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="text-lg font-semibold">Recent Violations</h2>
            </div>
            <div className="text-sm text-muted-foreground">
              {getFilteredViolations().length} violations in {timeRange === '1y' ? 'last 1y' : `last ${timeRange}`}
            </div>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {getFilteredViolations().length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No violations in the selected time range</p>
                <p className="text-sm">Your code is compliant with all enabled constraints!</p>
              </div>
            ) : (
              getFilteredViolations().slice(0, 200).map((violation) => {
                const isExpanded = expandedViolations.has(violation.id)
                return (
                  <div key={violation.id} data-violation-id={violation.id} className="border border-border rounded-lg">
                    <div
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => toggleViolationExpansion(violation.id)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex-shrink-0 w-2 h-2 rounded-full ${getSeverityColor(violation.severity)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                              {violation.constraint_id}
                            </code>
                            <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                              {formatTimestamp(violation.timestamp)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {violation.message}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(violation.timestamp)}
                        </span>
                        {getSeverityIcon(violation.severity)}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border p-3 bg-muted/20">
                        <div className="space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="font-medium text-muted-foreground">Tool:</span>
                              <span className="ml-1">{violation.tool || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">Session:</span>
                              <span className="ml-1 font-mono">{violation.session_id || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">Context:</span>
                              <span className="ml-1">{violation.context || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">File:</span>
                              <span className="ml-1 font-mono">{violation.file_path || 'N/A'}</span>
                            </div>
                            {violation.matches && (
                              <div>
                                <span className="font-medium text-muted-foreground">Matches:</span>
                                <span className="ml-1">{violation.matches}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-muted-foreground">Source:</span>
                              <span className="ml-1">{violation.source || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border">
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Full Timestamp:</span>
                              <span className="ml-1 font-mono">{violation.timestamp}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
            {getFilteredViolations().length > 200 && (
              <div className="text-center py-3 text-sm text-muted-foreground border-t">
                Showing 200 of {getFilteredViolations().length} violations
                <p className="text-xs mt-1">Scroll to see more</p>
              </div>
            )}
          </div>
          </Card>
        </div>

        {/* Constraint Groups Management Section */}
        <div ref={constraintGroupsRef}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <h2 className="text-lg font-semibold">Constraint Configuration</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleExpandAll}
                  className="h-8 px-2"
                >
                  {allExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Expand All
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {/* Get unique groups from constraints */}
              {[...new Set(constraints.map(c => c.groupId).filter(Boolean))].map((groupId) => {
                // Create a dummy group object since we only have constraints
                const group = {
                  id: groupId,
                  name: groupId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  description: `Constraints for ${groupId}`,
                  icon: '🔧',
                  color: 'blue',
                  enabled: true
                }
                const groupConstraints = constraints?.filter(c => c.groupId === groupId) || []
                const stats = getGroupStats(groupId)
                const isExpanded = expandedGroups.includes(groupId)
                const groupToggleState = groupToggleStates[groupId] ?? (groupConstraints.length > 0 && groupConstraints.every(c => c.enabled))
                const isToggling = togglingGroups.has(groupId)

                return (
                  <div key={groupId} className="border border-border rounded-lg">
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => toggleAccordionGroup(groupId)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-lg">{group.icon}</div>
                        <div className="flex-1">
                          <h3 className="font-medium">{group.name}</h3>
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Enabled:</span>
                            <span className="font-medium">{stats.enabled}/{stats.total}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Violations:</span>
                            <span className="font-medium text-red-600">{stats.violations}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={groupToggleState}
                          onCheckedChange={(checked) => toggleConstraintGroup(groupId, checked)}
                          disabled={isToggling}
                          className="h-5 w-9"
                        />
                        {isToggling && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        )}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border">
                        <div className="p-3 space-y-2">
                          {groupConstraints.map((constraint) => {
                            const isConstraintToggling = togglingConstraints.has(constraint.id)
                            return (
                              <div
                                key={constraint.id}
                                className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted/70 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <code className="text-xs font-mono bg-background px-1 py-0.5 rounded">
                                      {constraint.id}
                                    </code>
                                    <span className={`text-xs px-1 py-0.5 rounded ${
                                      constraint.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                      constraint.severity === 'error' ? 'bg-orange-100 text-orange-800' :
                                      constraint.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-blue-100 text-blue-800'
                                    }`}>
                                      {constraint.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {constraint.message}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  <Switch
                                    checked={constraint.enabled}
                                    onCheckedChange={() => toggleConstraint(constraint.id, constraint.enabled)}
                                    disabled={isConstraintToggling}
                                    className="h-4 w-7"
                                  />
                                  {isConstraintToggling && (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
