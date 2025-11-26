# Patent AI Backend - Setup Guide

> Quick start guide to connect your Patent AI backend to VSCode Copilot Chat

---

## Prerequisites

✅ Your Patent AI backend running at `http://localhost:8000`
✅ Backend implements OpenAI-compatible `/v1/chat/completions` endpoint
✅ You have an API key for your backend

---

## Quick Start (5 minutes)

### Step 1: Enable Patent AI Mode

Add to your `.vscode/settings.json`:

```json
{
  "patent.enabled": true,
  "patent.apiKey": "your-api-key-here",
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions"
}
```

**OR** use environment variables:

```bash
export PATENT_AI_MODE=true
export PATENT_API_KEY="your-api-key"
export PATENT_API_URL="http://localhost:8000/v1/chat/completions"
```

### Step 2: Modify Service Registration

Edit `src/extension/extension/vscode-node/services.ts`:

**Add import at the top** (around line 7-12):

```typescript
import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';
```

**Replace the authentication service registration** (around line 154-162):

```typescript
// ADD THIS CHECK BEFORE EXISTING CODE
const isPatentMode = process.env.PATENT_AI_MODE === 'true' ||
                     extensionContext.globalState.get<boolean>('patent.enabled', false);

if (isPatentMode) {
    // ✅ Use Patent AI mock authentication
    builder.define(IAuthenticationService, new SyncDescriptor(PatentAuthenticationService));
    logService.info('[Patent AI] Using Patent AI authentication service');
} else if (isScenarioAutomation) {
    // Scenario automation mode
    builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
    builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
} else {
    // Standard GitHub authentication
    builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
}
```

### Step 3: Build and Run

```bash
# In vscode-copilot-chat directory
npm run watch

# Press F5 to launch Extension Development Host
# OR
# Run: "Debug: Start Debugging" from Command Palette
```

### Step 4: Test

1. Open Extension Development Host window
2. Open Copilot Chat panel (icon in sidebar)
3. Send a message: "Hello, are you connected?"
4. Check your backend logs - you should see the request!

---

## Detailed Setup

### Configuration Options

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| `patent.enabled` | `PATENT_AI_MODE` | `false` | Enable Patent AI mode |
| `patent.apiKey` | `PATENT_API_KEY` | (required) | Your backend API key |
| `patent.apiUrl` | `PATENT_API_URL` | `http://localhost:8000/v1/chat/completions` | Backend URL |
| `patent.modelId` | `PATENT_MODEL_ID` | `patent-gpt` | Model identifier |

### Full Configuration Example

`.vscode/settings.json`:

```json
{
  "patent.enabled": true,
  "patent.apiKey": "pk_test_1234567890abcdef",
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions",
  "patent.modelId": "patent-gpt-4",

  // Optional: VSCode Copilot Chat settings
  "github.copilot.enable": {
    "*": true,
    "yaml": true,
    "plaintext": true,
    "markdown": true
  }
}
```

---

## Backend Requirements

Your backend at `/Users/neoak/projects/patnet-ai-backend/src` must implement:

### 1. Chat Completions Endpoint

```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "patent-gpt",
  "messages": [
    {"role": "system", "content": "You are a patent AI assistant"},
    {"role": "user", "content": "Search patents for AI agents"}
  ],
  "stream": true,
  "temperature": 0.7
}
```

### 2. Streaming Response Format (Server-Sent Events)

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"content":"I'll"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"content":" search"},"finish_reason":null}]}

data: [DONE]
```

### 3. Non-Streaming Response (Optional Fallback)

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "patent-gpt",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I'll search patents for AI agents..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 100,
    "total_tokens": 120
  }
}
```

### 4. Tool Calling Support (Recommended)

**Request with tools**:

```json
{
  "model": "patent-gpt",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "patent_search",
        "description": "Search patent databases",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {"type": "string"},
            "jurisdiction": {"type": "string", "enum": ["US", "EP", "CN"]}
          },
          "required": ["query"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**Response with tool calls**:

```json
{
  "id": "chatcmpl-123",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_123",
            "type": "function",
            "function": {
              "name": "patent_search",
              "arguments": "{\"query\":\"AI agents\",\"jurisdiction\":\"US\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

### 5. Error Responses

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

---

## Verification Checklist

### ✅ Extension Side

- [ ] Patent mode enabled in settings or env vars
- [ ] API key configured
- [ ] Backend URL correct
- [ ] `services.ts` modified to use `PatentAuthenticationService`
- [ ] Extension builds without errors (`npm run watch`)
- [ ] No GitHub sign-in prompt shown
- [ ] Chat panel opens successfully

### ✅ Backend Side

- [ ] Backend running on configured port (default: 8000)
- [ ] `/v1/chat/completions` endpoint implemented
- [ ] Bearer token authentication working
- [ ] Streaming responses (SSE) working
- [ ] CORS headers configured (if needed)
- [ ] Error handling implemented

### ✅ Integration

- [ ] Can send messages in chat panel
- [ ] Backend receives requests with correct API key
- [ ] Responses display in chat
- [ ] Streaming works (text appears progressively)
- [ ] Multi-turn conversations work
- [ ] Tool calling works (if implemented)

---

## Testing

### Manual Testing

```bash
# 1. Start your backend
cd /Users/neoak/projects/patnet-ai-backend
npm run dev  # or whatever starts your server

# 2. Verify backend is running
curl http://localhost:8000/v1/health
# Should return 200 OK

# 3. Test chat endpoint directly
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "patent-gpt",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'

# 4. Build extension
cd /Users/neoak/projects/vscode-copilot-chat
npm run watch

# 5. Launch Extension Development Host (Press F5)

# 6. Test in chat panel
# - Send message: "Hello"
# - Check backend logs for incoming request
# - Verify response appears in chat
```

### Automated Testing

```bash
# Run extension tests
npm test

# Run specific test
npm test -- --grep "Patent"
```

---

## Troubleshooting

### Issue: Extension still shows GitHub sign-in

**Cause**: Patent mode not enabled or service not registered

**Solution**:
1. Check `patent.enabled` is `true` in settings
2. OR check `PATENT_AI_MODE=true` in environment
3. Verify `services.ts` has Patent mode check
4. Check Extension Host logs: CMD+Shift+P → "Developer: Show Logs"

### Issue: Backend not receiving requests

**Cause**: URL incorrect or CORS issue

**Solution**:
1. Verify backend URL in settings matches actual backend
2. Check backend logs - is it running?
3. Test endpoint directly with curl
4. Add CORS headers to backend:

```typescript
// In your backend (Express example)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  next();
});
```

### Issue: 401 Unauthorized errors

**Cause**: API key incorrect or not being sent

**Solution**:
1. Check API key in settings matches backend
2. Check Extension Host logs for "[Patent AI] Request headers prepared"
3. Verify backend is checking `Authorization: Bearer` header
4. Test with curl to confirm backend auth works

### Issue: Responses not streaming

**Cause**: Backend not sending SSE format correctly

**Solution**:
1. Ensure backend sends `Content-Type: text/event-stream`
2. Each chunk must be prefixed with `data: `
3. End stream with `data: [DONE]\n\n`
4. Example:

```typescript
// Backend (Express example)
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Send chunks
res.write(`data: ${JSON.stringify(chunk)}\n\n`);

// End stream
res.write('data: [DONE]\n\n');
res.end();
```

### Issue: Tools not working

**Cause**: Backend doesn't support tool calling or wrong format

**Solution**:
1. Verify backend accepts `tools` parameter in request
2. Verify backend returns `tool_calls` in response
3. Check tool format matches OpenAI spec
4. Enable logging to see tool calls:

```typescript
// In Extension Development Host console
window.localStorage.setItem('copilot.debug', 'true');
```

---

## Logging and Debugging

### Enable Debug Logging

1. Open Extension Development Host
2. Help → Toggle Developer Tools
3. Console tab
4. Look for `[Patent AI]` prefixed logs

### Log Levels

```typescript
// In Extension Host console
// Enable verbose logging
window.localStorage.setItem('copilot.logLevel', 'trace');

// View authentication state
window.localStorage.setItem('copilot.logAuth', 'true');

// View network requests
window.localStorage.setItem('copilot.logNetwork', 'true');
```

### Check Backend Logs

Your backend should log:
- Incoming requests (method, path, headers)
- Authentication status
- Request body (messages, tools, etc.)
- Response sent
- Any errors

---

## Next Steps

### ✅ Phase 1 Complete When:
- No GitHub sign-in prompt
- Extension activates successfully
- Mock token has all features enabled

### ✅ Phase 2 Complete When:
- Can send chat messages
- Backend receives requests
- Responses display in chat

### ✅ Phase 3 Complete When:
- Full conversations work
- Tool calling works
- Context injection works

### 🚀 Future Enhancements:

1. **Custom Tools**
   - Patent search tool
   - Prior art analysis tool
   - Claim generation tool
   - Sandbox execution tool

2. **UI Customization**
   - Custom welcome screen
   - Patent-specific UI elements
   - Custom command palette commands

3. **Advanced Features**
   - Multi-jurisdiction support
   - Patent portfolio analysis
   - Citation network visualization

---

## Support

### Resources

- [PATENT_BACKEND_INTEGRATION_PLAN.md](./PATENT_BACKEND_INTEGRATION_PLAN.md) - Detailed implementation plan
- [AUTHENTICATION_ARCHITECTURE.md](./AUTHENTICATION_ARCHITECTURE.md) - Auth system details
- [AUTH_REPLACEMENT_GUIDE.md](./AUTH_REPLACEMENT_GUIDE.md) - Strategy and alternatives

### Getting Help

1. Check Extension Host logs
2. Check backend logs
3. Test endpoint directly with curl
4. Review error messages carefully
5. Check this guide's Troubleshooting section

---

**Generated**: 2025-11-20
**Backend**: `/Users/neoak/projects/patnet-ai-backend/src`
**Status**: Ready to implement!
