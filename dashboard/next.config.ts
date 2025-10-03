import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Expose environment variables from .env.ports to client-side
    CONSTRAINT_DASHBOARD_PORT: process.env.CONSTRAINT_DASHBOARD_PORT || '3030',
    CONSTRAINT_API_PORT: process.env.CONSTRAINT_API_PORT || '3031',
  },
};

export default nextConfig;
