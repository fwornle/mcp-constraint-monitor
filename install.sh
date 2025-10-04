#!/bin/bash

# MCP Constraint Monitor Installation Script
# This script installs all dependencies for the constraint monitor system

set -e  # Exit on any error

echo "🔧 Installing MCP Constraint Monitor..."

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: package.json not found. Please run this script from the mcp-constraint-monitor directory."
    exit 1
fi

echo "📦 Installing main dependencies..."
npm install

echo "📦 Installing dashboard dependencies..."
cd dashboard

# Check if pnpm is available, use it if possible for better dependency resolution
if command -v pnpm &> /dev/null; then
    echo "Using pnpm for dashboard dependencies..."
    pnpm install
else
    echo "Using npm for dashboard dependencies..."
    npm install
fi

# Install Redux dependencies that were added manually
echo "📦 Installing Redux state management dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm add @reduxjs/toolkit react-redux @types/react-redux
else
    npm install @reduxjs/toolkit react-redux @types/react-redux
fi

cd ..

echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env and configure your settings"
echo "2. Start the API server: npm run api"
echo "3. Start the dashboard: cd dashboard && npm run dev"
echo ""
echo "🚀 The constraint monitor is ready to use!"