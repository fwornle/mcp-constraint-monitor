#!/bin/bash

# MCP Constraint Monitor Uninstallation Script
# This script removes all dependencies and build artifacts

set -e  # Exit on any error

echo "🗑️  Uninstalling MCP Constraint Monitor..."

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: package.json not found. Please run this script from the constraint-monitor directory."
    exit 1
fi

echo "🧹 Cleaning main dependencies..."
if [[ -d "node_modules" ]]; then
    rm -rf node_modules
    echo "   ✅ Removed main node_modules"
fi

if [[ -f "package-lock.json" ]]; then
    rm -f package-lock.json
    echo "   ✅ Removed package-lock.json"
fi

echo "🧹 Cleaning dashboard dependencies..."
cd dashboard

if [[ -d "node_modules" ]]; then
    rm -rf node_modules
    echo "   ✅ Removed dashboard node_modules"
fi

if [[ -f "package-lock.json" ]]; then
    rm -f package-lock.json
    echo "   ✅ Removed dashboard package-lock.json"
fi

if [[ -f "pnpm-lock.yaml" ]]; then
    rm -f pnpm-lock.yaml
    echo "   ✅ Removed pnpm-lock.yaml"
fi

if [[ -d ".next" ]]; then
    rm -rf .next
    echo "   ✅ Removed Next.js build cache"
fi

cd ..

echo "🧹 Cleaning build artifacts and logs..."
if [[ -d "data" ]]; then
    find data -name "*.log" -delete 2>/dev/null || true
    echo "   ✅ Cleaned data logs"
fi

if [[ -d "logs" ]]; then
    rm -rf logs/*
    echo "   ✅ Cleaned logs directory"
fi

if [[ -f "dashboard.log" ]]; then
    rm -f dashboard.log
    echo "   ✅ Removed dashboard.log"
fi

echo "✅ Uninstallation complete!"
echo ""
echo "📋 To reinstall:"
echo "   ./install.sh"