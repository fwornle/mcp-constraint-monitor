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
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Settings, Folder, Clock, Zap, Power, PowerOff } from 'lucide-react'

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
    const constraintInterval = setInterval(fetchConstraintData, 30000) // Refresh every 30 seconds
    const projectInterval = setInterval(fetchProjects, 60000) // Refresh projects every minute
    return () => {
      clearInterval(constraintInterval)
      clearInterval(projectInterval)
    }
  }, [])

  const fetchConstraintData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`http://localhost:3001/api/constraints?grouped=true&project=${selectedProject}`)
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
      const response = await fetch(`http://localhost:3001/api/violations?project=${selectedProject}`)
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
      
      const response = await fetch(`http://localhost:3001/api/constraints/${constraintId}/toggle`, {
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
        
        // Refresh data after a short delay to sync with backend
        setTimeout(() => {
          fetchConstraintData()
        }, 500)
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
      
      const groupConstraints = data?.constraints?.filter(c => c.group === groupId) || []
      
      // Toggle all constraints in the group
      const togglePromises = groupConstraints.map(constraint =>
        fetch(`http://localhost:3001/api/constraints/${constraint.id}/toggle`, {
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
              constraint.group === groupId
                ? { ...constraint, enabled: enableAll }
                : constraint
            )
          }
        })
        
        // Refresh data after a short delay
        setTimeout(() => {
          fetchConstraintData()
        }, 500)
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
      const response = await fetch('http://localhost:3001/api/projects')
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
    
    const groupConstraints = data.constraints?.filter(c => c.group === groupId) || []
    const violations = data.violations?.filter(v => 
      groupConstraints.some(c => c.id === v.constraintId)
    ) || []
    
    return {
      total: groupConstraints.length,
      enabled: groupConstraints.filter(c => c.enabled).length,
      violations: violations.length
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Constraint Monitor Dashboard
              {selectedProject && selectedProject !== 'current' && (
                <span className="ml-3 text-xl font-medium text-primary bg-primary/10 px-3 py-1 rounded-lg">
                  {selectedProject}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">
              Real-time constraint monitoring and compliance tracking
              {selectedProject && selectedProject !== 'current' && (
                <span className="ml-2">
                  • Monitoring <span className="font-bold text-primary">{selectedProject}</span> project
                  {selectedProject !== currentProject && (
                    <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      Remote
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={selectedProject} onValueChange={setSelectedProject} disabled={projectSwitching}>
              <SelectTrigger className="w-64 min-w-48">
                <Folder className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select project..." />
                {projectSwitching && (
                  <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                )}
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.name} value={project.name} className="min-w-0">
                    <div className="flex items-center justify-between w-full min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {selectedProject === project.name && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{project.name}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        {project.current && <Badge variant="default" className="text-xs px-1">Current</Badge>}
                        {project.active && !project.current && <Badge variant="secondary" className="text-xs px-1">Active</Badge>}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm" onClick={toggleExpandAll}>
              {allExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Expand All
                </>
              )}
            </Button>
          </div>
        </div>

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

        {/* Summary Stats */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Constraints</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data?.constraints?.length || 0}
                </div>
                <Progress 
                  value={data?.constraints?.length ? 
                    (data.constraints.filter(c => c.enabled).length / data.constraints.length) * 100 
                    : 0
                  } 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.constraints?.filter(c => c.enabled).length || 0} enabled
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Groups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.groups?.length || 0}</div>
                <p className="text-xs text-muted-foreground">constraint categories</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recent Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{violations?.length || 0}</div>
                <p className="text-xs text-muted-foreground">last 24 hours</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {data?.constraints?.length && data.constraints.length > 0 
                    ? Math.round(((data.constraints.length - (violations?.length || 0)) / data.constraints.length) * 100)
                    : 100}%
                </div>
                <p className="text-xs text-muted-foreground">overall health</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Violations Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Violations Timeline
                </CardTitle>
                <CardDescription>Chronological view of recent constraint violations</CardDescription>
              </div>
              {violationsLoading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {violations && violations.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {violations
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .slice(0, 10)
                  .map((violation) => (
                    <div key={violation.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50">
                      <div className="flex-shrink-0 mt-1">
                        <div className={`w-2 h-2 rounded-full ${getSeverityColor(violation.severity)}`}></div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline" 
                              className={`${getSeverityColor(violation.severity)} text-white text-xs`}
                            >
                              {violation.severity}
                            </Badge>
                            {violation.tool && (
                              <Badge variant="secondary" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                {violation.tool}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTimeAgo(violation.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{violation.message}</p>
                        {violation.context && (
                          <p className="text-xs text-muted-foreground font-mono bg-muted p-1 rounded truncate">
                            {violation.context}
                          </p>
                        )}
                        {violation.session_id && (
                          <p className="text-xs text-muted-foreground">
                            Session: <code className="bg-muted px-1 rounded">{violation.session_id}</code>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {violations.length > 10 && (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground">
                      Showing 10 of {violations.length} violations
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-medium">No Recent Violations</p>
                <p className="text-muted-foreground">All constraints are being respected</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Constraint Groups */}
        {data && (
          <Card>
            <CardHeader>
              <CardTitle>Constraint Groups</CardTitle>
              <CardDescription>Organized constraint monitoring by category</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" value={expandedGroups} className="w-full">
                {data.groups && data.groups.map((group) => {
                  const stats = getGroupStats(group.id)
                  const groupConstraints = data.constraints?.filter(c => c.group === group.id) || []
                  
                  return (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger 
                        className="hover:no-underline"
                        onClick={(e) => {
                          // Only toggle accordion if click wasn't on the group toggle button
                          const target = e.target as HTMLElement
                          if (!target.closest('.group-toggle-btn')) {
                            toggleAccordionGroup(group.id)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full mr-4">
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-3 h-3 rounded-full`}
                              style={{ backgroundColor: group.color }}
                            />
                            <div className="text-left">
                              <div className="font-medium">{group.name}</div>
                              <div className="text-sm text-muted-foreground">{group.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{stats.total} rules</Badge>
                            <Badge variant="secondary">{stats.enabled} active</Badge>
                            {stats.violations > 0 && (
                              <Badge variant="destructive">{stats.violations} violations</Badge>
                            )}
                            
                            {/* Group Toggle Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="group-toggle-btn h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation() // Prevent accordion toggle
                                const groupConstraints = data?.constraints?.filter(c => c.group === group.id) || []
                                const allEnabled = groupConstraints.every(c => c.enabled)
                                toggleConstraintGroup(group.id, !allEnabled)
                              }}
                              disabled={togglingGroups.has(group.id)}
                            >
                              {togglingGroups.has(group.id) ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                              ) : (
                                <>
                                  {(() => {
                                    const groupConstraints = data?.constraints?.filter(c => c.group === group.id) || []
                                    const allEnabled = groupConstraints.every(c => c.enabled)
                                    const noneEnabled = groupConstraints.every(c => !c.enabled)
                                    
                                    if (allEnabled) {
                                      return (
                                        <>
                                          <PowerOff className="h-3 w-3 mr-1" />
                                          Disable All
                                        </>
                                      )
                                    } else if (noneEnabled) {
                                      return (
                                        <>
                                          <Power className="h-3 w-3 mr-1" />
                                          Enable All
                                        </>
                                      )
                                    } else {
                                      return (
                                        <>
                                          <Power className="h-3 w-3 mr-1" />
                                          Enable All
                                        </>
                                      )
                                    }
                                  })()
                                  }
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="mt-4 overflow-x-auto">
                          <Table className="w-full table-fixed">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16 flex-shrink-0">Status</TableHead>
                                <TableHead className="w-96 min-w-64">Constraint</TableHead>
                                <TableHead className="w-24 flex-shrink-0">Severity</TableHead>
                                <TableHead className="w-72 min-w-48">Pattern</TableHead>
                                <TableHead className="w-24 flex-shrink-0">Violations</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupConstraints.map((constraint) => {
                                const violationCount = data.violations?.filter(
                                  v => v.constraintId === constraint.id
                                )?.length || 0
                                
                                const isToggling = togglingConstraints.has(constraint.id)
                                
                                return (
                                  <TableRow 
                                    key={constraint.id} 
                                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                                    onClick={() => !isToggling && toggleConstraint(constraint.id, constraint.enabled)}
                                  >
                                    <TableCell className="w-16 flex-shrink-0">
                                      <div className="flex items-center justify-center">
                                        {isToggling ? (
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                                        ) : constraint.enabled ? (
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <div className="h-4 w-4 rounded-full bg-gray-300 border-2 border-gray-400" />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="w-96 min-w-64 font-mono text-sm">
                                      <div className="truncate pr-2" title={constraint.message}>
                                        {constraint.message}
                                      </div>
                                    </TableCell>
                                    <TableCell className="w-24 flex-shrink-0">
                                      <Badge 
                                        variant="secondary"
                                        className={`${getSeverityColor(constraint.severity)} text-white text-xs`}
                                      >
                                        <span className="flex items-center gap-1">
                                          {getSeverityIcon(constraint.severity)}
                                          <span className="truncate">{constraint.severity}</span>
                                        </span>
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="w-72 min-w-48 font-mono text-xs text-muted-foreground">
                                      <div className="truncate pr-2" title={constraint.pattern}>
                                        {constraint.pattern}
                                      </div>
                                    </TableCell>
                                    <TableCell className="w-24 flex-shrink-0 text-center">
                                      {violationCount > 0 ? (
                                        <Badge variant="destructive" className="text-xs">{violationCount}</Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-xs">0</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}