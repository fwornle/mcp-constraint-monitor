#!/bin/bash

# MCP Constraint Monitor Installation Script
# This script installs all dependencies for the constraint monitor system
#
# Usage:
#   ./install.sh              # Full installation (dependencies + hooks)
#   ./install.sh --skip-hooks # Install only dependencies, skip hook configuration

set -e  # Exit on any error

# Parse command line arguments
SKIP_HOOKS=false
if [[ "$1" == "--skip-hooks" ]]; then
    SKIP_HOOKS=true
fi

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

# Note: Redux dependencies (@reduxjs/toolkit, react-redux, @types/react-redux)
# are already in dashboard/package.json and will be installed by the above command

cd ..

# Install Claude Code hooks (unless --skip-hooks flag is set)
if [[ "$SKIP_HOOKS" == true ]]; then
    echo "⏭️  Skipping Claude Code hooks installation (--skip-hooks flag set)"
    echo ""
    echo "✅ Dependencies installation complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Copy .env.example to .env and configure your settings"
    echo "2. Configure hooks manually in your Claude settings"
    echo "3. Start the API server: npm run api"
    echo "4. Start the dashboard: cd dashboard && npm run dev"
    echo ""
    echo "🚀 The constraint monitor dependencies are ready!"
    exit 0
fi

echo "🪝 Installing Claude Code hooks..."

# Detect coding repo root (go up two levels from integrations/mcp-constraint-monitor)
CODING_REPO="$(cd ../.. && pwd)"
CLAUDE_SETTINGS="$CODING_REPO/.claude/settings.local.json"

# Create .claude directory if it doesn't exist
mkdir -p "$CODING_REPO/.claude"

# Check if settings file exists
if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
    echo "Creating new settings.local.json with hooks..."
    cat > "$CLAUDE_SETTINGS" << 'EOF'
{
  "permissions": {
    "allow": [],
    "deny": [],
    "ask": []
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node CODING_REPO/integrations/mcp-constraint-monitor/src/hooks/pre-prompt-hook-wrapper.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node CODING_REPO/integrations/mcp-constraint-monitor/src/hooks/pre-tool-hook-wrapper.js"
          }
        ]
      }
    ]
  }
}
EOF
    # Replace placeholder with actual path
    sed -i.bak "s|CODING_REPO|$CODING_REPO|g" "$CLAUDE_SETTINGS"
    rm -f "$CLAUDE_SETTINGS.bak"
    echo "✅ Created settings.local.json with constraint monitor hooks"
else
    # Settings file exists - check if hooks are already configured
    if grep -q "pre-prompt-hook-wrapper.js" "$CLAUDE_SETTINGS" 2>/dev/null; then
        echo "✅ Constraint monitor hooks already configured"
    else
        echo "⚠️  Settings file exists but hooks are not configured"
        echo "   Please manually add hooks to: $CLAUDE_SETTINGS"
        echo ""
        echo "   Add this to the 'hooks' section:"
        echo '   "UserPromptSubmit": ['
        echo '     {'
        echo '       "hooks": ['
        echo '         {'
        echo '           "type": "command",'
        echo "           \"command\": \"node $CODING_REPO/integrations/mcp-constraint-monitor/src/hooks/pre-prompt-hook-wrapper.js\""
        echo '         }'
        echo '       ]'
        echo '     }'
        echo '   ],'
        echo '   "PreToolUse": ['
        echo '     {'
        echo '       "hooks": ['
        echo '         {'
        echo '           "type": "command",'
        echo "           \"command\": \"node $CODING_REPO/integrations/mcp-constraint-monitor/src/hooks/pre-tool-hook-wrapper.js\""
        echo '         }'
        echo '       ]'
        echo '     }'
        echo '   ]'
    fi
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env and configure your settings"
echo "2. Start the API server: npm run api"
echo "3. Start the dashboard: cd dashboard && npm run dev"
echo "4. Restart Claude Code to activate the hooks"
echo ""
echo "🚀 The constraint monitor is ready to use!"
echo "🪝 Hooks installed - constraints will be enforced in Claude Code sessions"