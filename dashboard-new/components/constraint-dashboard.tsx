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
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Settings, Folder } from 'lucide-react'

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

interface ConstraintData {
  groups: ConstraintGroup[]
  constraints: Constraint[]
  violations: Array<{
    constraintId: string
    timestamp: string
    message: string
    severity: string
    sessionId?: string
  }>
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
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('current')
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentProject, setCurrentProject] = useState<string>('')

  useEffect(() => {
    fetchConstraintData()
    fetchProjects()
    const constraintInterval = setInterval(fetchConstraintData, 30000) // Refresh every 30 seconds
    const projectInterval = setInterval(fetchProjects, 60000) // Refresh projects every minute
    return () => {
      clearInterval(constraintInterval)
      clearInterval(projectInterval)
    }
  }, [selectedProject])

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
          violations: [] // Will be populated from violations API
        }
        setData(transformedData)
      }
      setError(null)
    } catch (err) {
      console.error('Failed to fetch constraint data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
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
        
        // Set selected project to current if not already set
        if (selectedProject === 'current' && result.data.currentProject) {
          setSelectedProject(result.data.currentProject)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch projects, using fallback', err)
      // Fallback to current project only
      setProjects([{
        name: 'Current Project',
        path: '/current',
        status: 'active',
        active: true,
        current: true
      }])
      setCurrentProject('Current Project')
    }
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const expandAll = () => {
    if (data) {
      setExpandedGroups(data.groups.map(g => g.id))
    }
  }

  const collapseAll = () => {
    setExpandedGroups([])
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
            <h1 className="text-3xl font-bold tracking-tight">Constraint Monitor Dashboard</h1>
            <p className="text-muted-foreground">
              Real-time constraint monitoring and compliance tracking
              {currentProject && (
                <span className="ml-2">
                  • <span className="font-medium">{currentProject}</span> project
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-48">
                <Folder className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.name} value={project.name}>
                    {project.name}
                    {project.current && <Badge variant="default" className="ml-2">Current</Badge>}
                    {project.active && !project.current && <Badge variant="secondary" className="ml-2">Active</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronDown className="h-4 w-4 mr-1" />
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                <ChevronUp className="h-4 w-4 mr-1" />
                Collapse All
              </Button>
            </div>
          </div>
        </div>

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
                <div className="text-2xl font-bold text-red-600">{data?.violations?.length || 0}</div>
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
                    ? Math.round(((data.constraints.length - (data?.violations?.length || 0)) / data.constraints.length) * 100)
                    : 100}%
                </div>
                <p className="text-xs text-muted-foreground">overall health</p>
              </CardContent>
            </Card>
          </div>
        )}

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
                        onClick={() => toggleGroup(group.id)}
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
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="mt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Status</TableHead>
                                <TableHead>Constraint</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead>Pattern</TableHead>
                                <TableHead className="w-24">Violations</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupConstraints.map((constraint) => {
                                const violationCount = data.violations?.filter(
                                  v => v.constraintId === constraint.id
                                )?.length || 0
                                
                                return (
                                  <TableRow key={constraint.id}>
                                    <TableCell>
                                      <div className="flex items-center">
                                        {constraint.enabled ? (
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <div className="h-4 w-4 rounded-full bg-gray-300" />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {constraint.message}
                                    </TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant="secondary"
                                        className={`${getSeverityColor(constraint.severity)} text-white`}
                                      >
                                        <span className="flex items-center gap-1">
                                          {getSeverityIcon(constraint.severity)}
                                          {constraint.severity}
                                        </span>
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                                      {constraint.pattern}
                                    </TableCell>
                                    <TableCell>
                                      {violationCount > 0 ? (
                                        <Badge variant="destructive">{violationCount}</Badge>
                                      ) : (
                                        <Badge variant="secondary">0</Badge>
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