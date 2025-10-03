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
  timestamp: number
  intervalTime: string
  actualTime: Date
  violationId?: string // Optional field for tracking individual violations
  isCurrentInterval?: boolean // Flag to highlight current time bin
}

export default function ConstraintDashboard() {
  const [data, setData] = useState<ConstraintData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [allExpanded, setAllExpanded] = useState(false)
  const [projectSwitching, setProjectSwitching] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('coding') // Start with coding instead of current
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentProject, setCurrentProject] = useState<string>('')
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [togglingConstraints, setTogglingConstraints] = useState<Set<string>>(new Set())
  const [togglingGroups, setTogglingGroups] = useState<Set<string>>(new Set())
  const [groupToggleStates, setGroupToggleStates] = useState<Record<string, boolean>>({})
  const [timeRange, setTimeRange] = useState<'24h' | '5d' | '1m' | '1y'>('24h')
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set())

  // Cycle through time ranges
  const cycleTimeRange = () => {
    const ranges: Array<'24h' | '5d' | '1m' | '1y'> = ['24h', '5d', '1m', '1y']
    const currentIndex = ranges.indexOf(timeRange)
    const nextIndex = (currentIndex + 1) % ranges.length
    setTimeRange(ranges[nextIndex])
  }

  // Refs for scrolling
  const violationsRef = useRef<HTMLDivElement>(null)
  const violationsListRef = useRef<HTMLDivElement>(null)
  const constraintGroupsRef = useRef<HTMLDivElement>(null)

  // Force initialization if useEffect doesn't work
  if (projects.length === 0 && loading && !data) {
    console.log('[DEBUG] Force triggering fetchProjects - useEffect bypass')
    setTimeout(() => fetchProjects(), 100)
  }

  // Force constraint data fetch if project is selected but no data
  if (selectedProject && selectedProject !== 'current' && !data && !error) {
    console.log('[DEBUG] Force triggering fetchConstraintData - selectedProject set but no data')
    setTimeout(() => fetchConstraintData(), 200)
  }

  useEffect(() => {
    console.log('[DEBUG] Initial mount - fetching projects and data')
    fetchProjects()
  }, [])

  useEffect(() => {
    console.log('[DEBUG] SelectedProject changed:', selectedProject)
    if (selectedProject && selectedProject !== 'current') {
      console.log('[DEBUG] Fetching constraints for project:', selectedProject)
      setProjectSwitching(true)
      fetchConstraintData().finally(() => setProjectSwitching(false))
    } else {
      console.log('[DEBUG] Skipping constraint fetch - selectedProject:', selectedProject)
    }
  }, [selectedProject])

  // Fallback: If we're still loading after 5 seconds, try to fetch data anyway
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (loading && !data) {
        console.log('[DEBUG] Fallback: Still loading after 5s, forcing data fetch')
        if (selectedProject && selectedProject !== 'current') {
          fetchConstraintData()
        } else {
          // Force set to coding project and fetch
          console.log('[DEBUG] Fallback: Setting project to coding and fetching')
          setSelectedProject('coding')
        }
      }
    }, 5000)

    return () => clearTimeout(fallbackTimer)
  }, [loading, data, selectedProject])

  useEffect(() => {
    if (!selectedProject) return

    const currentProject = selectedProject
    const constraintInterval = setInterval(() => {
      // Only refresh if we're still on the same project
      if (selectedProject === currentProject) {
        fetchConstraintData()
      }
    }, 30000) // Refresh every 30 seconds
    
    const projectInterval = setInterval(() => {
      // Project list can refresh regardless of selected project
      fetchProjects()
    }, 60000) // Refresh projects every minute
    
    return () => {
      clearInterval(constraintInterval)
      clearInterval(projectInterval)
    }
  }, [selectedProject]) // Project-aware dependency

  const fetchConstraintData = async () => {
    try {
      console.log('[DEBUG] fetchConstraintData starting for project:', selectedProject)
      setLoading(true)
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/constraints?grouped=true&project=${selectedProject}`)
      console.log('[DEBUG] Constraints API response status:', response.status)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      console.log('[DEBUG] Constraints API result:', result)
      
      // Transform the API response to match component expectations
      if (result.status === 'success' && result.data) {
        const transformedData = {
          groups: result.data.constraints.map((groupData: {group: ConstraintGroup, constraints: Constraint[]}) => groupData.group),
          constraints: result.data.constraints.flatMap((groupData: {group: ConstraintGroup, constraints: Constraint[]}) => groupData.constraints),
          violations: [] // Will be updated by separate violations fetch
        }
        console.log('[DEBUG] Setting transformed data:', transformedData)
        setData(transformedData)
        
        // Initialize group toggle states ONLY if not already set (preserve manual toggles)
        setGroupToggleStates(prev => {
          // If previous state exists, update only new groups while preserving existing ones
          const newGroupStates = { ...prev }
          let hasChanges = false
          
          transformedData.groups.forEach((group: ConstraintGroup) => {
            // Only initialize groups that don't already have a state
            if (!(group.id in prev)) {
              const groupConstraints = transformedData.constraints.filter((c: Constraint) => c.groupId === group.id)
              newGroupStates[group.id] = groupConstraints.length > 0 && groupConstraints.every((c: Constraint) => c.enabled)
              hasChanges = true
            }
          })
          
          return hasChanges ? newGroupStates : prev
        })
        
        setError(null)
      } else {
        console.error('[DEBUG] Unexpected API response format:', result)
        setError('Invalid API response format')
        return
      }
      
      // Also fetch violations
      fetchViolationsData()
    } catch (err) {
      console.error('[DEBUG] Failed to fetch constraint data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      console.log('[DEBUG] fetchConstraintData completed')
      setLoading(false)
    }
  }

  const fetchViolationsData = async () => {
    try {
      setViolationsLoading(true)
      console.log('[DEBUG] Fetching violations for project:', selectedProject)
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/violations?project=${selectedProject}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      console.log('[DEBUG] API response result:', result)
      
      if (result.status === 'success' && result.data) {
        const violationsData = Array.isArray(result.data) ? result.data : []
        console.log('[DEBUG] Processed violations data:', violationsData.length, 'violations')
        console.log('[DEBUG] First violation:', violationsData[0])
        
        // Update data with violations - ensure it always updates
        console.log('[DEBUG] Current data object:', data)
        console.log('[DEBUG] Updating data.violations with', violationsData.length, 'violations')
        setData(prevData => {
          if (prevData) {
            const updatedData = { ...prevData, violations: violationsData }
            console.log('[DEBUG] Updated data object:', updatedData)
            return updatedData
          } else {
            // If no prevData, create new data object with violations
            const newData = { groups: [], constraints: [], violations: violationsData }
            console.log('[DEBUG] Created new data object:', newData)
            return newData
          }
        })
      } else {
        console.log('[DEBUG] API response format issue:', result)
        // Note: violations will remain empty in data object
      }
    } catch (err) {
      console.warn('Failed to fetch violations data:', err)
      // Note: violations will remain empty in data object
    } finally {
      setViolationsLoading(false)
    }
  }

  const toggleConstraint = async (constraintId: string, currentEnabled: boolean) => {
    try {
      setTogglingConstraints(prev => new Set(prev).add(constraintId))
      
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/constraints/${constraintId}/toggle?project=${selectedProject}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: !currentEnabled }),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.status === 'success') {
        // Update local state immediately for responsive UI
        setData(prevData => {
          if (!prevData) return prevData
          return {
            ...prevData,
            constraints: prevData.constraints.map(constraint =>
              constraint.id === constraintId
                ? { ...constraint, enabled: !currentEnabled }
                : constraint
            )
          }
        })
        
        // Project-aware refresh: only refresh if still on the same project
        const currentProject = selectedProject
        setTimeout(() => {
          if (selectedProject === currentProject) {
            fetchConstraintData()
          }
        }, 2000)
      }
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
      
      const groupConstraints = data?.constraints?.filter(c => c.groupId === groupId) || []
      
      // Update group toggle state immediately for UI responsiveness
      setGroupToggleStates(prev => ({
        ...prev,
        [groupId]: enableAll
      }))
      
      // Toggle all constraints in the group with project parameter
      const togglePromises = groupConstraints.map(constraint =>
        fetch(`${CONFIG.API_BASE_URL}/api/constraints/${constraint.id}/toggle?project=${selectedProject}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled: enableAll }),
        })
      )
      
      const results = await Promise.all(togglePromises)
      
      // Check if all requests succeeded
      const allSucceeded = results.every(response => response.ok)
      
      if (allSucceeded) {
        // Update local state immediately
        setData(prevData => {
          if (!prevData) return prevData
          return {
            ...prevData,
            constraints: prevData.constraints.map(constraint =>
              constraint.groupId === groupId
                ? { ...constraint, enabled: enableAll }
                : constraint
            )
          }
        })
        
        // Project-aware refresh: only refresh if still on the same project
        const currentProject = selectedProject
        setTimeout(() => {
          if (selectedProject === currentProject) {
            fetchConstraintData()
          }
        }, 2000)
      } else {
        // Revert group toggle state if API calls failed
        setGroupToggleStates(prev => ({
          ...prev,
          [groupId]: !enableAll
        }))
        throw new Error('Some constraints failed to toggle')
      }
    } catch (err) {
      console.error('Failed to toggle group:', err)
      alert(`Failed to toggle group: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setTogglingGroups(prev => {
        const newSet = new Set(prev)
        newSet.delete(groupId)
        return newSet
      })
    }
  }

  const fetchProjects = async () => {
    try {
      console.log('[DEBUG] Fetching projects...')
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/projects`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      console.log('[DEBUG] Projects response:', result)
      if (result.status === 'success') {
        setProjects(result.data)
        setCurrentProject('coding')
        
        console.log('[DEBUG] Current selectedProject:', selectedProject, 'Current project from API: coding')
        // Only update selectedProject if it's still "current" - don't override user selection
        if (selectedProject === 'current') {
          console.log('[DEBUG] Setting selectedProject to: coding')
          setSelectedProject('coding')
          // Since useEffect isn't working, fetch constraints directly here
          console.log('[DEBUG] Force triggering fetchConstraintData after project selection')
          setTimeout(() => fetchConstraintData(), 300)
        } else if (selectedProject !== 'current') {
          // If a project is already selected, fetch its constraints
          console.log('[DEBUG] Project already selected, fetching constraints')
          fetchConstraintData()
        }
      }
    } catch (err) {
      console.warn('Failed to fetch projects, using fallback', err)
      // Fallback to current project only
      const fallbackProject = 'Current Project'
      setProjects([{
        name: fallbackProject,
        path: '/current',
        status: 'active',
        active: true,
        current: true
      }])
      setCurrentProject(fallbackProject)
      if (selectedProject === 'current') {
        setSelectedProject(fallbackProject)
      }
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
    if (data) {
      setExpandedGroups(data.groups.map(g => g.id))
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500'
      case 'error': return 'bg-red-400' 
      case 'warning': return 'bg-yellow-400'
      case 'info': return 'bg-blue-400'
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

  const getGroupStats = (groupId: string) => {
    if (!data) return { total: 0, enabled: 0, violations: 0 }
    
    const groupConstraints = data.constraints?.filter(c => c.groupId === groupId) || []
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
    if (!data?.violations?.length) return []
    const cutoff = subHours(new Date(), hours)
    return data.violations.filter(v => {
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
    if (!data?.violations) {
      throw new Error('Violations data not loaded - data.violations is missing')
    }

    console.log('[DEBUG] getFilteredViolations - timeRange:', timeRange, 'data.violations.length:', data.violations.length)

    if (!data.violations.length) return []

    const now = new Date()
    let cutoff: Date
    let filteredViolations = data.violations

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
        console.log('[DEBUG] timeRange=1y, returning all', data.violations.length, 'violations')
        // Don't filter by time for 1y, but still apply sorting below
        break
      default:
        break
    }

    // Filter by time range if not 1y
    if (timeRange !== '1y') {
      filteredViolations = data.violations.filter(v => {
        try {
          const violationTime = parseISO(v.timestamp)
          return isAfter(violationTime, cutoff)
        } catch {
          return false
        }
      })
    }

    // Sort by timestamp (newest first) and severity (most severe first as secondary key)
    const severityOrder = { critical: 3, error: 2, warning: 1, info: 0 }

    return filteredViolations.sort((a, b) => {
      // Primary sort: timestamp (newest first)
      const timeA = new Date(a.timestamp).getTime()
      const timeB = new Date(b.timestamp).getTime()
      if (timeB !== timeA) {
        return timeB - timeA // Descending order (newest first)
      }

      // Secondary sort: severity (most severe first)
      const severityA = severityOrder[a.severity as keyof typeof severityOrder] || 0
      const severityB = severityOrder[b.severity as keyof typeof severityOrder] || 0
      return severityB - severityA // Descending order (most severe first)
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
        fullTime: format(intervalTime, 'MMM dd HH:mm') + ' - ' + format(intervalEnd, 'HH:mm'),
        violations: 0, // Will be populated below
        warning: 0,    // Severity-based counts for stacked bars
        error: 0,
        critical: 0,
        timestamp: intervalTime.getTime(),
        intervalTime: intervalTime.toISOString(),
        actualTime: intervalTime,
        isCurrentInterval
      })
    }

    console.log('[DEBUG] Generated', intervals.length, `${intervalHours}h intervals for ${timelineHours}h period`)
    console.log('[DEBUG] First interval:', intervals[0])
    console.log('[DEBUG] Last interval:', intervals[intervals.length - 1])

    if (!data?.violations) {
      console.log('[DEBUG] No violations data available, returning empty intervals')
      return intervals // Return intervals with zero violations
    }

    console.log('[DEBUG] Chart function - data.violations.length:', data.violations.length)

    if (!data.violations.length) {
      console.log('[DEBUG] No violations data, returning empty intervals with zero violations')
      return intervals // Return intervals with zero violations
    }

    console.log('[DEBUG] Processing', data.violations.length, 'violations')

    // Aggregate violations into intervals
    data.violations.forEach(violation => {
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
            } else {
              intervals[intervalIndex].warning += 1
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

    // Always return the consistent interval structure
    return intervals
  }

  // Get accurate statistics with improved compliance algorithm
  const getAccurateStats = () => {
    const recent24h = getRecentViolations(24)
    const recent7d = getRecentViolations(7 * 24)

    const totalConstraints = data?.constraints?.length || 0
    const enabledConstraints = data?.constraints?.filter(c => c.enabled).length || 0

    // IMPROVED COMPLIANCE ALGORITHM:
    // Compliance should reflect constraint adherence over time, not just violation count
    // It should decay with time and be able to recover to 100%
    let complianceRate = 100

    if (enabledConstraints > 0 && recent24h.length > 0) {
      // Calculate unique constraints violated in last 24h
      const violatedConstraints = new Set(recent24h.map(v => v.constraint_id)).size

      // Base penalty: percentage of constraints violated
      const constraintPenalty = (violatedConstraints / enabledConstraints) * 100

      // Volume penalty: extra violations beyond one per constraint (scaled down)
      const excessViolations = Math.max(0, recent24h.length - violatedConstraints)
      const volumePenalty = Math.min(20, excessViolations * 2) // Cap at 20% additional penalty

      // Total penalty (constraint coverage + volume)
      const totalPenalty = constraintPenalty + volumePenalty

      complianceRate = Math.max(0, Math.round(100 - totalPenalty))
    }

    return {
      totalConstraints,
      enabledConstraints,
      groupCount: data?.groups?.length || 0,
      recentViolations24h: recent24h.length,
      recentViolations7d: recent7d.length,
      complianceRate: Math.max(0, Math.min(100, complianceRate)),
      // Add debugging info
      violatedConstraintsCount: recent24h.length > 0 ? new Set(recent24h.map(v => v.constraint_id)).size : 0
    }
  }

  // Debug state values before render decisions
  console.log('[DEBUG] Render decision - loading:', loading, 'data:', !!data, 'error:', error, 'selectedProject:', selectedProject, 'projects.length:', projects.length)

  if (loading && !data) {
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
                    onClick={() => setTimeRange('24h')}
                    className="h-7 px-2"
                  >
                    24h
                  </Button>
                  <Button
                    variant={timeRange === '5d' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimeRange('5d')}
                    className="h-7 px-2"
                  >
                    5d
                  </Button>
                  <Button
                    variant={timeRange === '1m' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimeRange('1m')}
                    className="h-7 px-2"
                  >
                    1m
                  </Button>
                  <Button
                    variant={timeRange === '1y' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimeRange('1y')}
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
                  {data?.violations?.length || 0} violations
                </div>
              </div>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                  onClick={(data) => {
                    if (data && data.activePayload && data.activePayload.length > 0) {
                      console.log('[DEBUG] Bar clicked, scrolling to violations list')
                      scrollToViolationsList()
                    }
                  }}
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
                    formatter={(value: number, name: string, props: any) => {
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
                    labelFormatter={(label: string, payload?: Array<any>) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0]?.payload
                        console.log('[DEBUG] Tooltip labelFormatter - payload data:', data)
                        const totalViolations = (data?.warning || 0) + (data?.error || 0) + (data?.critical || 0)
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
                    dataKey="warning"
                    stackId="severity"
                    fill="#fbbf24"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="error"
                    stackId="severity"
                    fill="#f87171"
                    stroke="#ef4444"
                    strokeWidth={1}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="critical"
                    stackId="severity"
                    fill="#dc2626"
                    stroke="#b91c1c"
                    strokeWidth={1}
                    radius={[2, 2, 0, 0]}
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
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {getFilteredViolations().length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No violations in the selected time range</p>
                <p className="text-sm">Your code is compliant with all enabled constraints!</p>
              </div>
            ) : (
              getFilteredViolations().slice(0, 20).map((violation) => {
                const isExpanded = expandedViolations.has(violation.id)
                return (
                  <div key={violation.id} className="border border-border rounded-lg">
                    <div
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => toggleViolationExpansion(violation.id)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex-shrink-0 w-2 h-2 rounded-full ${getSeverityColor(violation.severity)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                              {violation.constraint_id}
                            </code>
                            <span className="text-xs text-muted-foreground truncate">
                              {violation.message}
                            </span>
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
                              <span className="ml-1 font-mono">{violation.session_id || violation.sessionId || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">Context:</span>
                              <span className="ml-1">{violation.context || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">File:</span>
                              <span className="ml-1 font-mono">{(violation as any).file_path || 'N/A'}</span>
                            </div>
                            {(violation as any).matches && (
                              <div>
                                <span className="font-medium text-muted-foreground">Matches:</span>
                                <span className="ml-1">{(violation as any).matches}</span>
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
              {data?.groups?.map((group) => {
                const groupConstraints = data.constraints?.filter(c => c.groupId === group.id) || []
                const stats = getGroupStats(group.id)
                const isExpanded = expandedGroups.includes(group.id)
                const groupToggleState = groupToggleStates[group.id] ?? (groupConstraints.length > 0 && groupConstraints.every(c => c.enabled))
                const isToggling = togglingGroups.has(group.id)

                return (
                  <div key={group.id} className="border border-border rounded-lg">
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => toggleAccordionGroup(group.id)}
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
                          <Switch
                            checked={groupToggleState}
                            disabled={isToggling || groupConstraints.length === 0}
                            onCheckedChange={(checked) => {
                              // Prevent event bubbling to avoid triggering accordion
                              event?.stopPropagation()
                              toggleConstraintGroup(group.id, checked)
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {isToggling && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          )}
                        </div>
                      </div>
                      <ChevronRight 
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                      />
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border p-3 bg-muted/20">
                        <div className="space-y-2">
                          {groupConstraints.map((constraint) => {
                            const isConstraintToggling = togglingConstraints.has(constraint.id)
                            return (
                              <div 
                                key={constraint.id} 
                                className="flex items-center justify-between p-2 bg-background rounded border border-border"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                                      {constraint.id}
                                    </code>
                                    <span className={`text-xs px-1 py-0.5 rounded ${
                                      constraint.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                      constraint.severity === 'error' ? 'bg-red-50 text-red-700' :
                                      constraint.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-blue-100 text-blue-800'
                                    }`}>
                                      {constraint.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    {constraint.message}
                                  </p>
                                  {constraint.suggestion && (
                                    <p className="text-xs text-muted-foreground italic">
                                      💡 {constraint.suggestion}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Switch
                                    checked={constraint.enabled}
                                    disabled={isConstraintToggling}
                                    onCheckedChange={() => toggleConstraint(constraint.id, constraint.enabled)}
                                  />
                                  {isConstraintToggling && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
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
