# Patent AI Mode Setup Guide

## Problem You Were Experiencing

The extension was showing `"Language model unavailable"` and this error in the console:

```
ERR [LM] Error resolving language models for vendor copilot:
SyntaxError: Unexpected token 'b', "bad reques"... is not valid JSON
```

**Root Cause:** The extension was using GitHub Copilot authentication by default because the `PATENT_AI_MODE` environment variable wasn't set.

## Solution

The extension needs `PATENT_AI_MODE=true` to bypass GitHub and use your Patent AI backend.

## Quick Start

### Option 1: Use the Launch Script (Recommended)

```bash
cd /Users/neoak/projects/vscode-copilot-chat
./launch-patent-mode.sh
```

This script automatically:
- Sets `PATENT_AI_MODE=true`
- Configures backend URL: `http://localhost:8000/v1/chat/completions`
- Sets API key: `test-api-key`
- Launches VS Code with the extension

### Option 2: Manual Launch

```bash
# Set environment variables
export PATENT_AI_MODE=true
export PATENT_API_URL="http://localhost:8000/v1/chat/completions"
export PATENT_API_KEY="test-api-key"

# Launch VS Code
cd /Users/neoak/projects/vscode
./scripts/code.sh --extensionDevelopmentPath=/Users/neoak/projects/vscode-copilot-chat
```

## Prerequisites

**Backend must be running:**

```bash
cd /Users/neoak/projects/patnet-ai-backend
npm run dev
```

Verify it's running:
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","timestamp":"..."}
```

## How Patent AI Mode Works

When `PATENT_AI_MODE=true`:

1. **Authentication:** Uses `PatentAuthenticationService` (bypasses GitHub)
2. **Endpoint:** Uses `PatentEndpointProvider` → your backend at localhost:8000
3. **API Key:** Uses Bearer token auth with your custom API key
4. **Format:** Sends OpenAI-compatible requests to your backend

Code location: `/src/extension/extension/vscode-node/services.ts` lines 156-186

```typescript
const isPatentMode = process.env.PATENT_AI_MODE === 'true' ||
                     extensionContext.globalState.get<boolean>('patent.enabled', false);

if (isPatentMode) {
    builder.define(IAuthenticationService, new SyncDescriptor(PatentAuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(PatentEndpointProvider, [collectFetcherTelemetry]));
} else {
    // Standard GitHub Copilot (causes "bad request" error)
    builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PATENT_AI_MODE` | `false` | Enable Patent AI backend (set to `true`) |
| `PATENT_API_URL` | `http://localhost:8000/v1/chat/completions` | Your backend URL |
| `PATENT_API_KEY` | `test-api-key` | Bearer token for backend auth |

### VS Code Settings (Optional)

You can also configure via VS Code settings:

```json
{
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions",
  "patent.apiKey": "your-api-key-here"
}
```

## Testing the Setup

1. **Start backend:**
   ```bash
   cd /Users/neoak/projects/patnet-ai-backend
   npm run dev
   ```

2. **Launch extension:**
   ```bash
   ./launch-patent-mode.sh
   ```

3. **Open Chat panel** in VS Code (Cmd+Shift+I or View → Chat)

4. **Send a test message:**
   ```
   Hello, can you help me analyze a patent?
   ```

5. **Expected behavior:**
   - ✅ No "Language model unavailable" error
   - ✅ Response streams back from your backend
   - ✅ Console shows: `[Patent AI] Making chat request to backend`

## Troubleshooting

### Still getting "bad request" error?

Check console logs for:
```
[Patent AI Services] Checking Patent AI mode: { ... }
```

If you see `isPatentMode: false`, the environment variable didn't load. Try:
- Closing ALL VS Code windows
- Running `./launch-patent-mode.sh` again
- Check terminal shows: `✓ Patent AI Mode: ENABLED`

### Backend not responding?

```bash
# Check if backend is running
curl http://localhost:8000/health

# Check if chat endpoint works
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"gpt-4o","stream":false}'
```

### Chat panel not showing?

- Make sure you launched from the script (environment variables must be set before VS Code starts)
- Check Output panel → "Copilot Chat" for detailed logs
- Look for `[Patent AI]` prefixed messages

## Architecture

```
┌─────────────────────────────────────────┐
│  VS Code (FlowLeap Patent IDE)          │
│  /Users/neoak/projects/vscode           │
│                                         │
│  Extension: vscode-copilot-chat         │
│  Mode: PATENT_AI_MODE=true              │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  PatentAuthenticationService    │   │
│  │  (bypasses GitHub)              │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  PatentEndpointProvider         │   │
│  │  → localhost:8000               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
              │
              │ POST /v1/chat/completions
              │ Authorization: Bearer test-api-key
              ↓
┌─────────────────────────────────────────┐
│  Patent AI Backend                      │
│  /Users/neoak/projects/patnet-ai-backend│
│  http://localhost:8000                  │
│                                         │
│  - OpenAI-compatible API                │
│  - Vercel AI SDK                        │
│  - Tool calling support                 │
└─────────────────────────────────────────┘
              │
              ↓
         OpenAI API
```

## Next Steps

Once the chat is working:

1. **Add Patent Tools:** Implement OPS API, USPTO API in your backend
2. **Configure Agents:** Add patent-specific chat participants
3. **Test Tool Calling:** Verify tools are invoked correctly
4. **Customize UI:** Rebrand for FlowLeap Patent IDE

## Files Modified

- ✅ `/src/extension/byok/node/patentAuthenticationService.ts` - Bypass GitHub auth
- ✅ `/src/extension/byok/vscode-node/patentEndpointProvider.ts` - Custom endpoint
- ✅ `/src/extension/byok/node/patentChatEndpoint.ts` - OpenAI-compatible requests
- ✅ `/src/extension/extension/vscode-node/services.ts` - Service registration with Patent mode check

## Success Criteria

- [ ] Backend running on port 8000
- [ ] Environment variable `PATENT_AI_MODE=true` set before launch
- [ ] VS Code launches without errors
- [ ] Chat panel shows no "Language model unavailable" error
- [ ] Sending message returns response from your backend
- [ ] Console shows `[Patent AI]` log messages

---

**Ready to test?** Run `./launch-patent-mode.sh` and open the Chat panel!
