/**
 * Dashboard Configuration
 * Port configuration that matches centralized .env.ports file
 * 
 * Note: These values should match the ones in ../../.env.ports:
 * - CONSTRAINT_DASHBOARD_PORT=3030
 * - CONSTRAINT_API_PORT=3031
 */

// Default port configuration (matches .env.ports file)
const DASHBOARD_PORT = 3030;
const API_PORT = 3031;

export const CONFIG = {
  API_BASE_URL: `http://localhost:${API_PORT}`,
  DASHBOARD_PORT,
  API_PORT,
} as const;

export default CONFIG;