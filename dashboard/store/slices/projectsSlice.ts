import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

// Types for projects state
export interface ProjectInfo {
  name: string
  displayName: string
  path: string
  active: boolean
  current?: boolean
  lastActivity: string
  status: 'active' | 'idle' | 'error' | 'unknown'
  health: 'healthy' | 'warning' | 'critical'
  violationCount: number
  complianceScore: number
  lastCheck: string
}

export interface ProjectsState {
  // Core data
  projects: ProjectInfo[]
  currentProject: string | null

  // Statistics
  totalProjects: number
  activeProjects: number
  healthyProjects: number
  projectsWithViolations: number

  // UI state
  loading: boolean
  error: string | null
  lastUpdate: number

  // Project management
  autoDetection: boolean
  refreshInterval: number // seconds
}

const initialState: ProjectsState = {
  projects: [],
  currentProject: null,
  totalProjects: 0,
  activeProjects: 0,
  healthyProjects: 0,
  projectsWithViolations: 0,
  loading: false,
  error: null,
  lastUpdate: 0,
  autoDetection: true,
  refreshInterval: 60
}

// Async thunks for API calls
export const fetchProjects = createAsyncThunk(
  'projects/fetchAll',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/projects`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const fetchProjectHealth = createAsyncThunk(
  'projects/fetchHealth',
  async (projectName: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/projects/${projectName}/health`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

export const setActiveProject = createAsyncThunk(
  'projects/setActive',
  async ({ projectName }: { projectName: string }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/projects/active`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project: projectName }),
    })

    if (!response.ok) {
      throw new Error(`Failed to set active project: ${response.statusText}`)
    }

    return { projectName }
  }
)

export const detectCurrentProject = createAsyncThunk(
  'projects/detectCurrent',
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3031'
    const response = await fetch(`${baseUrl}/api/projects/detect`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
)

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    // Synchronous actions for UI updates
    setCurrentProject: (state, action: PayloadAction<string | null>) => {
      state.currentProject = action.payload

      // Update active status for all projects
      state.projects.forEach(project => {
        project.active = project.name === action.payload
      })
    },

    updateProjectInfo: (state, action: PayloadAction<ProjectInfo>) => {
      const index = state.projects.findIndex(p => p.name === action.payload.name)
      if (index >= 0) {
        state.projects[index] = action.payload
      } else {
        state.projects.push(action.payload)
      }

      // Recalculate statistics
      state.totalProjects = state.projects.length
      state.activeProjects = state.projects.filter(p => p.status === 'active').length
      state.healthyProjects = state.projects.filter(p => p.health === 'healthy').length
      state.projectsWithViolations = state.projects.filter(p => p.violationCount > 0).length
    },

    updateProjectHealth: (state, action: PayloadAction<{
      projectName: string
      health: 'healthy' | 'warning' | 'critical'
      violationCount: number
      complianceScore: number
    }>) => {
      const project = state.projects.find(p => p.name === action.payload.projectName)
      if (project) {
        project.health = action.payload.health
        project.violationCount = action.payload.violationCount
        project.complianceScore = action.payload.complianceScore
        project.lastCheck = new Date().toISOString()

        // Recalculate statistics
        state.healthyProjects = state.projects.filter(p => p.health === 'healthy').length
        state.projectsWithViolations = state.projects.filter(p => p.violationCount > 0).length
      }
    },

    addProject: (state, action: PayloadAction<ProjectInfo>) => {
      const exists = state.projects.some(p => p.name === action.payload.name)
      if (!exists) {
        state.projects.push(action.payload)
        state.totalProjects = state.projects.length
      }
    },

    removeProject: (state, action: PayloadAction<string>) => {
      state.projects = state.projects.filter(p => p.name !== action.payload)
      state.totalProjects = state.projects.length

      if (state.currentProject === action.payload) {
        state.currentProject = null
      }
    },

    setAutoDetection: (state, action: PayloadAction<boolean>) => {
      state.autoDetection = action.payload
    },

    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.refreshInterval = Math.max(30, action.payload) // Minimum 30 seconds
    },

    clearError: (state) => {
      state.error = null
    }
  },

  extraReducers: (builder) => {
    // Handle async thunk actions
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false
        state.lastUpdate = Date.now()

        // API returns { status: "success", data: [...] } where data is the projects array
        const apiResponse = action.payload
        const projectsArray = apiResponse.data || []

        if (Array.isArray(projectsArray) && projectsArray.length > 0) {
          // Transform API format to internal ProjectInfo format
          state.projects = projectsArray.map((p: any) => ({
            name: p.name,
            displayName: p.name,
            path: p.path,
            active: p.status === 'active',
            lastActivity: p.lastActivity || new Date().toISOString(),
            status: p.status || 'unknown',
            health: 'healthy',  // Default - will be updated by health check
            violationCount: 0,  // Default - will be updated by violations API
            complianceScore: 100,  // Default
            lastCheck: new Date().toISOString()
          }))
          state.totalProjects = state.projects.length
          state.activeProjects = state.projects.filter(p => p.status === 'active').length
          state.healthyProjects = state.projects.length  // All default to healthy
          state.projectsWithViolations = 0  // Will be updated after loading violations
        }

        if (apiResponse.currentProject) {
          state.currentProject = apiResponse.currentProject
        }
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch projects data'
      })
      .addCase(fetchProjectHealth.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.projectName) {
          const project = state.projects.find(p => p.name === data.projectName)
          if (project) {
            project.health = data.health || 'unknown'
            project.violationCount = data.violationCount || 0
            project.complianceScore = data.complianceScore || 100
            project.lastCheck = new Date().toISOString()
          }
        }
      })
      .addCase(setActiveProject.fulfilled, (state, action) => {
        state.currentProject = action.payload.projectName

        // Update active status for all projects
        state.projects.forEach(project => {
          project.active = project.name === action.payload.projectName
        })
      })
      .addCase(setActiveProject.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to set active project'
      })
      .addCase(detectCurrentProject.fulfilled, (state, action) => {
        const data = action.payload.data || action.payload

        if (data.project) {
          state.currentProject = data.project

          // Update active status
          state.projects.forEach(project => {
            project.active = project.name === data.project
          })
        }
      })
      .addCase(detectCurrentProject.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to detect current project'
      })
  },
})

export const {
  setCurrentProject,
  updateProjectInfo,
  updateProjectHealth,
  addProject,
  removeProject,
  setAutoDetection,
  setRefreshInterval,
  clearError,
} = projectsSlice.actions

export default projectsSlice.reducer

// Selectors
export const selectProjects = (state: { projects: ProjectsState }) => state.projects.projects
export const selectCurrentProject = (state: { projects: ProjectsState }) => state.projects.currentProject
export const selectTotalProjects = (state: { projects: ProjectsState }) => state.projects.totalProjects
export const selectActiveProjects = (state: { projects: ProjectsState }) => state.projects.activeProjects
export const selectHealthyProjects = (state: { projects: ProjectsState }) => state.projects.healthyProjects
export const selectProjectsWithViolations = (state: { projects: ProjectsState }) => state.projects.projectsWithViolations
export const selectProjectsLoading = (state: { projects: ProjectsState }) => state.projects.loading
export const selectProjectsError = (state: { projects: ProjectsState }) => state.projects.error
export const selectAutoDetection = (state: { projects: ProjectsState }) => state.projects.autoDetection
export const selectProjectsRefreshInterval = (state: { projects: ProjectsState }) => state.projects.refreshInterval

// Derived selectors
export const selectCurrentProjectInfo = (state: { projects: ProjectsState }) => {
  if (!state.projects.currentProject) return null
  return state.projects.projects.find(p => p.name === state.projects.currentProject) || null
}

export const selectProjectByName = (state: { projects: ProjectsState }, projectName: string) => {
  return state.projects.projects.find(p => p.name === projectName) || null
}