"use client"

import { useState, useEffect } from 'react'
import { Activity, AlertCircle, CheckCircle2, Info, ExternalLink } from 'lucide-react'
import CONFIG from '@/lib/config'

const SYSTEM_HEALTH_DASHBOARD_PORT = 3032

interface SystemHealthData {
  overall_status: 'healthy' | 'degraded' | 'critical'
  coordinator: {
    status: string
    pid: number | null
    uptime: number | null
  }
  watchdog: {
    status: string
    last_check: Date | null
  }
  projects: Array<{
    name: string
    status: string
    monitorAlive: boolean
    exchanges: number
  }>
  services: {
    dashboard: { status: string; port: number }
    api: { status: string; port: number }
  }
}

export default function SystemHealthIndicator() {
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/system-health`)
        const result = await response.json()
        if (result.status === 'success') {
          setHealth(result.data)
        }
      } catch (error) {
        console.error('Failed to fetch system health:', error)
      } finally {
        setLoading(false)
      }
    }

    // Fetch once on mount, no auto-refresh (only refresh on user action or when monitoring issues detected)
    fetchHealth()
  }, [])

  if (loading || !health) {
    return null // Inconspicuous when loading
  }

  const getStatusIcon = () => {
    switch (health.overall_status) {
      case 'healthy':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />
      case 'degraded':
        return <AlertCircle className="h-3 w-3 text-amber-500" />
      case 'critical':
        return <AlertCircle className="h-3 w-3 text-red-500" />
      default:
        return <Info className="h-3 w-3 text-gray-400" />
    }
  }

  const getStatusColor = () => {
    switch (health.overall_status) {
      case 'healthy':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'degraded':
        return 'bg-amber-50 border-amber-200 text-amber-800'
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border ${getStatusColor()} hover:opacity-80 transition-opacity`}
        title="System Health Status"
      >
        {getStatusIcon()}
        <span className="font-medium capitalize">{health.overall_status}</span>
        <Activity className="h-3 w-3" />
      </button>

      {expanded && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-3 space-y-2 text-xs">
            <div className="pb-2 border-b space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">System Health</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor()}`}>
                  {health.overall_status}
                </span>
              </div>
              <a
                href={`http://localhost:${SYSTEM_HEALTH_DASHBOARD_PORT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Open System Health Dashboard</span>
              </a>
            </div>

            {/* Coordinator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Coordinator:</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  health.coordinator.status === 'operational'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {health.coordinator.status}
                </span>
              </div>
              {health.coordinator.pid && (
                <div className="text-gray-500 text-[10px] ml-2">
                  PID: {health.coordinator.pid} • Uptime: {Math.floor((health.coordinator.uptime || 0) / 3600)}h
                </div>
              )}
            </div>

            {/* Watchdog */}
            {health.watchdog.status !== 'unknown' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Watchdog:</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  health.watchdog.status === 'operational'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {health.watchdog.status}
                </span>
              </div>
            )}

            {/* Projects */}
            {health.projects.length > 0 && (
              <div className="space-y-1">
                <div className="text-gray-600 font-medium">Projects:</div>
                {health.projects.map((project) => (
                  <div key={project.name} className="ml-2 flex items-center justify-between">
                    <span className="text-gray-700">{project.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      project.status === 'active' && project.monitorAlive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Services */}
            <div className="pt-2 border-t space-y-1">
              <div className="text-gray-600 font-medium">Services:</div>
              <div className="ml-2 flex items-center justify-between">
                <span className="text-gray-700">Dashboard (:{health.services.dashboard.port})</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800">
                  {health.services.dashboard.status}
                </span>
              </div>
              <div className="ml-2 flex items-center justify-between">
                <span className="text-gray-700">API (:{health.services.api.port})</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800">
                  {health.services.api.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
