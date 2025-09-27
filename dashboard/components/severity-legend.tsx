'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Info, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, AlertCircle, XCircle } from 'lucide-react'

interface SeverityLegendProps {
  onSeverityToggle?: (severity: string, enabled: boolean) => void
  activeSeverities?: string[]
}

export function SeverityLegend({ onSeverityToggle, activeSeverities = ['critical', 'error', 'warning', 'info'] }: SeverityLegendProps) {
  const [isOpen, setIsOpen] = useState(false)

  const severityLevels = [
    {
      name: 'Critical',
      level: 'critical',
      color: 'bg-red-600',
      textColor: 'text-red-600',
      icon: <XCircle className="h-4 w-4" />,
      description: 'Blocks execution immediately. Must be fixed before proceeding.',
      examples: ['Hardcoded secrets', 'eval() usage', 'SQL injection vulnerabilities'],
      action: 'Execution is blocked until resolved'
    },
    {
      name: 'Error',
      level: 'error',
      color: 'bg-red-500',
      textColor: 'text-red-500',
      icon: <AlertTriangle className="h-4 w-4" />,
      description: 'Blocks execution immediately. Serious violations that need correction.',
      examples: ['Empty catch blocks', 'Parallel file creation', 'Architectural violations'],
      action: 'Execution is blocked until resolved'
    },
    {
      name: 'Warning',
      level: 'warning',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      icon: <AlertCircle className="h-4 w-4" />,
      description: 'Allows execution but strongly recommends changes.',
      examples: ['console.log usage', 'deprecated APIs', 'suboptimal patterns'],
      action: 'Execution continues with notification'
    },
    {
      name: 'Info',
      level: 'info',
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      icon: <CheckCircle className="h-4 w-4" />,
      description: 'Informational suggestions for code improvement.',
      examples: ['Code style suggestions', 'documentation improvements', 'optimization tips'],
      action: 'Execution continues normally'
    }
  ]

  const toggleSeverity = (severity: string) => {
    const isActive = activeSeverities.includes(severity)
    onSeverityToggle?.(severity, !isActive)
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4" />
          Severity Levels & Controls
        </CardTitle>
        <CardDescription className="text-xs">
          Understanding constraint severity levels and their impact on Claude Code execution
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="text-sm font-medium">How severity levels affect execution</span>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {severityLevels.map((severity) => {
              const isActive = activeSeverities.includes(severity.level)
              
              return (
                <div key={severity.level} className={`border rounded-lg p-3 transition-all ${isActive ? 'border-primary bg-primary/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`${severity.textColor}`}>
                        {severity.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{severity.name}</h4>
                          <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                            {severity.level.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {severity.description}
                        </p>
                      </div>
                    </div>
                    
                    {onSeverityToggle && (
                      <Button
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => toggleSeverity(severity.level)}
                      >
                        {isActive ? 'ON' : 'OFF'}
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-medium text-muted-foreground">Action: </span>
                      <span className={`font-medium ${severity.level === 'critical' || severity.level === 'error' ? 'text-red-600' : severity.level === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`}>
                        {severity.action}
                      </span>
                    </div>
                    
                    <div>
                      <span className="font-medium text-muted-foreground">Examples: </span>
                      <div className="mt-1">
                        {severity.examples.map((example, index) => (
                          <Badge key={index} variant="outline" className="text-xs mr-1 mb-1">
                            {example}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium text-blue-800 mb-1">Real-time Enforcement</div>
                  <p className="text-blue-700">
                    Critical and Error level violations block Claude Code execution immediately. 
                    Warning and Info levels allow execution to continue but provide feedback for improvement.
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}