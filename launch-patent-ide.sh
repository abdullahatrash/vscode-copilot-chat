#!/bin/bash
export PATENT_AI_MODE=true
export PATENT_API_URL=http://localhost:8000
export COPILOT_CHAT_DEBUG=true

# Kill any existing instances
pkill -f "Code Helper.*copilot-chat" 2>/dev/null

# Launch VS Code with Patent AI mode
code --extensionDevelopmentPath=/Users/neoak/projects/vscode-copilot-chat --disable-extensions
