import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'

// Import slices
// Removed globalHealthReducer - endpoints don't exist
import projectsReducer from './slices/projectsSlice'
import constraintsReducer from './slices/constraintsSlice'
import apiCostReducer from './slices/apiCostSlice'
import lslWindowReducer from './slices/lslWindowSlice'

// Import middleware
import { statusLineMiddleware } from './middleware/statusLineMiddleware'
import { apiMiddleware } from './middleware/apiMiddleware'

export const store = configureStore({
  reducer: {
    // Removed globalHealth - API endpoints don't exist
    projects: projectsReducer,
    constraints: constraintsReducer,
    apiCost: apiCostReducer,
    lslWindow: lslWindowReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all actions
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates'],
      },
    })
      .concat(statusLineMiddleware)
      .concat(apiMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks for use throughout the app
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector