# Patent AI Integration - Quick Start

> Get your Patent AI backend connected in 5 minutes

---

## ✅ Prerequisites

- [ ] Patent AI backend running at `http://localhost:8000`
- [ ] Backend has `/v1/chat/completions` endpoint
- [ ] You have an API key

---

## 🚀 Setup (3 Steps)

### 1. Configure (30 seconds)

Create `.vscode/settings.json`:

```json
{
  "patent.enabled": true,
  "patent.apiKey": "your-api-key-here",
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions"
}
```

### 2. Modify Code (2 minutes)

Edit `src/extension/extension/vscode-node/services.ts`:

**Add import** (top of file, ~line 12):
```typescript
import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';
```

**Replace auth registration** (~line 154-162):
```typescript
const isPatentMode = process.env.PATENT_AI_MODE === 'true' ||
                     extensionContext.globalState.get<boolean>('patent.enabled', false);

if (isPatentMode) {
    builder.define(IAuthenticationService, new SyncDescriptor(PatentAuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
    logService.info('[Patent AI] 🎯 Patent AI mode enabled');
} else if (isScenarioAutomation) {
    builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
    builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
} else {
    builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
}
```

### 3. Build & Launch (2 minutes)

```bash
# Build
npm run watch

# Launch (Press F5 or run from debug panel)
# Opens Extension Development Host window
```

---

## ✨ Test (1 minute)

1. Open Copilot Chat panel (sidebar icon)
2. Send message: "Hello, are you there?"
3. Check your backend logs - should see the request!

---

## 🔍 Verify

### Extension Logs

CMD+Shift+P → "Developer: Show Logs" → "Extension Host"

**Should see**:
```
[Patent AI] 🎯 Patent AI mode enabled
[Patent AI] ✅ Mock authentication active
[Patent AI] ✅ API key configured: pk_t***xyz
[Patent AI] 🌐 Backend URL: http://localhost:8000/v1/chat/completions
```

### Backend Logs

**Should receive**:
```
POST /v1/chat/completions
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "model": "patent-gpt",
  "messages": [
    {"role": "user", "content": "Hello, are you there?"}
  ],
  "stream": true
}
```

---

## ❌ Troubleshooting

### Still shows GitHub sign-in?

```bash
# Check Patent mode is enabled
export PATENT_AI_MODE=true
# Then restart extension
```

### Backend not getting requests?

```bash
# Test backend directly
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"patent-gpt","messages":[{"role":"user","content":"test"}]}'
```

### Responses not showing?

Check backend returns OpenAI format:
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "patent-gpt",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! I'm here."
    },
    "finish_reason": "stop"
  }]
}
```

---

## 📚 Need More Help?

- **Setup details**: [PATENT_AI_SETUP_GUIDE.md](PATENT_AI_SETUP_GUIDE.md)
- **Implementation**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Code changes**: [SERVICES_TS_MODIFICATION.md](SERVICES_TS_MODIFICATION.md)
- **Full plan**: [PATENT_BACKEND_INTEGRATION_PLAN.md](PATENT_BACKEND_INTEGRATION_PLAN.md)

---

## 🎉 That's It!

You now have:
- ✅ Your own authentication (no GitHub)
- ✅ Your own backend (localhost:8000)
- ✅ Full VSCode Copilot Chat UI
- ✅ All agent features working

**Happy coding!** 🚀

---

**Time to complete**: ~5 minutes
**Lines of code to change**: 14
**Your backend**: `/Users/neoak/projects/patnet-ai-backend/src`
