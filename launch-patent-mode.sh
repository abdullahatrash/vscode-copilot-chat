#!/bin/bash

# FlowLeap Patent AI Mode - Launch Script
# This script launches the vscode-copilot-chat extension with Patent AI backend

echo "========================================="
echo "🚀 Launching VS Code with Patent AI Mode"
echo "========================================="

# Enable Patent AI mode
export PATENT_AI_MODE=true

# Set Patent AI backend configuration
export PATENT_API_URL="http://localhost:8000/v1/chat/completions"
export PATENT_API_KEY="test-api-key"  # Your backend API key

echo "✓ Patent AI Mode: ENABLED"
echo "✓ Backend URL: $PATENT_API_URL"
echo "✓ API Key: ${PATENT_API_KEY:0:8}..."
echo ""
echo "📝 Make sure your backend is running:"
echo "   cd /Users/neoak/projects/patnet-ai-backend"
echo "   npm run dev"
echo ""
echo "========================================="

# Launch VS Code with the extension
cd /Users/neoak/projects/vscode
./scripts/code.sh --extensionDevelopmentPath=/Users/neoak/projects/vscode-copilot-chat
