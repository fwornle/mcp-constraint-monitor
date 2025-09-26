"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Settings, Folder, Clock, Zap, Power, PowerOff, TrendingUp, Activity } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { isAfter, subHours, subDays, format, parseISO } from 'date-fns'

interface Constraint {
  id: string
  pattern: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  enabled: boolean
  groupId?: string
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

export function ConstraintDashboard() {
  const [data, setData] = useState<ConstraintData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectSwitching, setProjectSwitching] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [allExpanded, setAllExpanded] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('current')
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentProject, setCurrentProject] = useState<string>('')
  const [violations, setViolations] = useState<Violation[]>([])
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [togglingConstraints, setTogglingConstraints] = useState<Set<string>>(new Set())
  const [togglingGroups, setTogglingGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    if (selectedProject && selectedProject !== 'current') {
      console.log('Fetching constraints for project:', selectedProject)
      setProjectSwitching(true)
      fetchConstraintData().finally(() => setProjectSwitching(false))
    }
  }, [selectedProject])

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
      setLoading(true)
      const response = await fetch(`http://localhost:3031/api/constraints?grouped=true&project=${selectedProject}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      
      // Transform the API response to match component expectations
      if (result.status === 'success' && result.data) {
        const transformedData = {
          groups: result.data.constraints.map((groupData: any) => groupData.group),
          constraints: result.data.constraints.flatMap((groupData: any) => groupData.constraints),
          violations: violations // Use violations from separate fetch
        }
        setData(transformedData)
      }
      setError(null)
      
      // Also fetch violations
      fetchViolationsData()
    } catch (err) {
      console.error('Failed to fetch constraint data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const fetchViolationsData = async () => {
    try {
      setViolationsLoading(true)
      const response = await fetch(`http://localhost:3031/api/violations?project=${selectedProject}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      
      if (result.status === 'success' && result.data) {
        const violationsData = Array.isArray(result.data) ? result.data : []
        setViolations(violationsData)
        
        // Update data with violations if data exists
        if (data) {
          setData(prevData => prevData ? { ...prevData, violations: violationsData } : prevData)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch violations data:', err)
      setViolations([])
    } finally {
      setViolationsLoading(false)
    }
  }

  const toggleConstraint = async (constraintId: string, currentEnabled: boolean) => {
    try {
      setTogglingConstraints(prev => new Set(prev).add(constraintId))
      
      const response = await fetch(`http://localhost:3031/api/constraints/${constraintId}/toggle?project=${selectedProject}`, {
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
      
      // Toggle all constraints in the group with project parameter
      const togglePromises = groupConstraints.map(constraint =>
        fetch(`http://localhost:3031/api/constraints/${constraint.id}/toggle?project=${selectedProject}`, {
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
      const response = await fetch('http://localhost:3031/api/projects')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      if (result.status === 'success') {
        setProjects(result.data.projects)
        setCurrentProject(result.data.currentProject)
        
        // Set selected project to current if not already set, then fetch constraints
        if (selectedProject === 'current' && result.data.currentProject) {
          setSelectedProject(result.data.currentProject)
          // Don't fetch constraints here since the useEffect will handle it
        } else if (selectedProject !== 'current') {
          // If a project is already selected, fetch its constraints
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
    if (!violations.length) return []
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

  // Generate chart data for violations timeline
  const getViolationsChartData = () => {
    if (!violations.length) return []
    
    const now = new Date()
    const data = []
    
    // Generate data points for last 7 days (6-hour intervals for better readability)
    for (let i = 7 * 4; i >= 0; i--) {
      const timePoint = subHours(now, i * 6)
      const intervalStart = subHours(timePoint, 6)
      
      const violationsInInterval = violations.filter(v => {
        try {
          const violationTime = parseISO(v.timestamp)
          return violationTime >= intervalStart && violationTime < timePoint
        } catch {
          return false
        }
      }).length
      
      data.push({
        time: format(timePoint, 'MMM dd'),
        fullTime: format(timePoint, 'MMM dd HH:mm'),
        violations: violationsInInterval,
        timestamp: timePoint.getTime()
      })
    }
    
    return data
  }

  // Get accurate statistics
  const getAccurateStats = () => {
    const recent24h = getRecentViolations(24)
    const recent7d = getRecentViolations(7 * 24)
    
    const totalConstraints = data?.constraints?.length || 0
    const enabledConstraints = data?.constraints?.filter(c => c.enabled).length || 0
    const complianceRate = totalConstraints > 0 ? Math.round((enabledConstraints - recent24h.length) / enabledConstraints * 100) : 100
    
    return {
      totalConstraints,
      enabledConstraints,
      groupCount: data?.groups?.length || 0,
      recentViolations24h: recent24h.length,
      recentViolations7d: recent7d.length,
      complianceRate: Math.max(0, Math.min(100, complianceRate))
    }
  }

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
              Real-time constraint monitoring and compliance tracking
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
                    <div className="flex items-center justify-between w-full min-w-0">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {selectedProject === project.name && (
                          <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                        )}
                        <span className="truncate text-sm">{project.name}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-1">
                        {project.current && <Badge variant="default" className="text-xs px-1 py-0">Current</Badge>}
                        {project.active && !project.current && <Badge variant="secondary" className="text-xs px-1 py-0">Active</Badge>}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={toggleExpandAll}>
              {allExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Compact Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Constraints</p>
                  <p className="text-lg font-bold">{stats.totalConstraints}</p>
                  <p className="text-xs text-muted-foreground">{stats.enabledConstraints} enabled</p>
                </div>
                <Settings className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Groups</p>
                  <p className="text-lg font-bold">{stats.groupCount}</p>
                  <p className="text-xs text-muted-foreground">constraint categories</p>
                </div>
                <Folder className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Recent Violations</p>
                  <p className={`text-lg font-bold ${stats.recentViolations24h > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {stats.recentViolations24h}
                  </p>
                  <p className="text-xs text-muted-foreground">last 24 hours</p>
                </div>
                <AlertTriangle className={`h-6 w-6 ${stats.recentViolations24h > 0 ? 'text-red-500' : 'text-green-500'}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Compliance Rate</p>
                  <p className="text-lg font-bold text-green-500">{stats.complianceRate}%</p>
                  <p className="text-xs text-muted-foreground">overall health</p>
                </div>
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compact Violations Timeline Chart */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Violations Timeline (7 days)
            </CardTitle>
            <CardDescription className="text-xs">
              Hourly violation counts over the past week
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    interval={Math.max(Math.floor(chartData.length / 6), 1)}
                    angle={-45}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={20} />
                  <Tooltip 
                    labelFormatter={(value, payload) => {
                      if (payload && payload[0] && payload[0].payload) {
                        return `Time: ${payload[0].payload.fullTime}`
                      }
                      return `Time: ${value}`
                    }}
                    formatter={(value) => [`${value} violations`, 'Count']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="violations" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Project Switch Notification */}
        {selectedProject && selectedProject !== currentProject && (
          <Alert className="border-blue-200 bg-blue-50">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">Monitoring Remote Project</AlertTitle>
            <AlertDescription className="text-blue-700">
              You are now viewing constraints for the <strong>{selectedProject}</strong> project.
              {currentProject && (
                <span> Your current project is <strong>{currentProject}</strong>.</span>
              )}
            </AlertDescription>
          </Alert>
        )}


        {/* Compact Constraint Groups */}
        {data && (
          <Card className="p-3">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-base">Constraint Groups</CardTitle>
              <CardDescription className="text-xs">Organized constraint monitoring by category</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Accordion type="multiple" value={expandedGroups} className="w-full">
                {data.groups && data.groups.map((group) => {
                  const stats = getGroupStats(group.id)
                  const groupConstraints = data.constraints?.filter(c => c.groupId === group.id) || []
                  
                  return (
                    <AccordionItem key={group.id} value={group.id} className="border-b last:border-b-0">
                      <AccordionTrigger 
                        className="hover:no-underline py-2 text-sm"
                        onClick={(e) => {
                          const target = e.target as HTMLElement
                          if (!target.closest('.group-toggle-btn')) {
                            toggleAccordionGroup(group.id)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full mr-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className={`w-2 h-2 rounded-full`}
                              style={{ backgroundColor: group.color }}
                            />
                            <div className="text-left">
                              <div className="font-medium text-sm">{group.name}</div>
                              <div className="text-xs text-muted-foreground">{group.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="text-xs px-1 py-0">{stats.total}</Badge>
                            <Badge variant="secondary" className="text-xs px-1 py-0">{stats.enabled} on</Badge>
                            {stats.violations > 0 && (
                              <Badge variant="destructive" className="text-xs px-1 py-0">{stats.violations}</Badge>
                            )}
                            
                            <div
                              className={`group-toggle-btn inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-6 px-2 cursor-pointer ${
                                togglingGroups.has(group.id) ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!togglingGroups.has(group.id)) {
                                  const groupConstraints = data?.constraints?.filter(c => c.groupId === group.id) || []
                                  const allEnabled = groupConstraints.every(c => c.enabled)
                                  toggleConstraintGroup(group.id, !allEnabled)
                                }
                              }}
                            >
                              {togglingGroups.has(group.id) ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                              ) : (
                                (() => {
                                  const allEnabled = groupConstraints.every(c => c.enabled)
                                  return allEnabled ? (
                                    <PowerOff className="h-3 w-3" />
                                  ) : (
                                    <Power className="h-3 w-3" />
                                  )
                                })()
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1 pb-2">
                        <div className="space-y-1 ml-4">
                          {groupConstraints.map((constraint) => {
                            const violationCount = getRecentViolations(24).filter(
                              v => v.constraint_id === constraint.id
                            ).length
                            
                            const isToggling = togglingConstraints.has(constraint.id)
                            
                            return (
                              <div 
                                key={constraint.id} 
                                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => !isToggling && toggleConstraint(constraint.id, constraint.enabled)}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {isToggling ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary flex-shrink-0" />
                                  ) : constraint.enabled ? (
                                    <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  ) : (
                                    <div className="h-3 w-3 rounded-full bg-gray-300 border-2 border-gray-400 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate" title={constraint.message}>
                                      {constraint.message}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono truncate" title={constraint.pattern}>
                                      {constraint.pattern}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Badge 
                                    variant="secondary"
                                    className={`${getSeverityColor(constraint.severity)} text-white text-xs px-1 py-0`}
                                  >
                                    {constraint.severity}
                                  </Badge>
                                  {violationCount > 0 ? (
                                    <Badge variant="destructive" className="text-xs px-1 py-0">{violationCount}</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs px-1 py-0">0</Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Compact Violation History - Moved to Bottom */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Violations History
                </CardTitle>
                <CardDescription className="text-xs">Latest constraint violations and their details</CardDescription>
              </div>
              {violationsLoading && (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {violations && violations.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {violations
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .slice(0, 10)
                  .map((violation) => (
                    <div key={violation.id} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getSeverityColor(violation.severity)}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge 
                            variant="outline" 
                            className={`${getSeverityColor(violation.severity)} text-white text-xs px-1 py-0`}
                          >
                            {violation.severity}
                          </Badge>
                          {violation.tool && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              {violation.tool}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                            {formatTimeAgo(violation.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-foreground truncate" title={violation.message}>
                          {violation.message}
                        </p>
                        {violation.context && (
                          <p className="text-xs text-muted-foreground font-mono bg-muted px-1 rounded truncate mt-1" title={violation.context}>
                            {violation.context}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {violations.length > 10 && (
                  <div className="text-center py-1">
                    <p className="text-xs text-muted-foreground">
                      Showing 10 of {violations.length} violations
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No Recent Violations</p>
                <p className="text-xs text-muted-foreground">All constraints are being respected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}