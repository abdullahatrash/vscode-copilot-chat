# FlowLeap Patent IDE - Integration Architecture Guide

## Overview

This guide explains how the **vscode-copilot-chat extension** connects to your **Patent AI Backend** and how to adapt it for FlowLeap Patent IDE.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  FlowLeap Patent IDE (VS Code Fork)                     │
│  - Custom branding                                       │
│  - Bundled with vscode-copilot-chat extension           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ Extension Host
                   ▼
┌─────────────────────────────────────────────────────────┐
│  vscode-copilot-chat Extension                          │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │  Extension Activation                       │         │
│  │  src/extension/extension/vscode-node/       │         │
│  │  extension.ts                               │         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────┐         │
│  │  Contribution System                        │         │
│  │  - Chat participants                        │         │
│  │  - Language model providers (BYOK)          │         │
│  │  - Tools registration                       │         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────┐         │
│  │  BYOK Provider Layer                        │         │
│  │  src/extension/byok/vscode-node/            │         │
│  │                                             │         │
│  │  - PatentEndpointProvider                  │         │
│  │  - OpenAIProvider                          │         │
│  │  - AnthropicProvider                       │         │
│  │  - OllamaProvider                          │         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────┐         │
│  │  Endpoint Layer                             │         │
│  │  src/extension/byok/node/                   │         │
│  │                                             │         │
│  │  - PatentChatEndpoint                      │         │
│  │  - Authentication                           │         │
│  │  - Request/Response transformation          │         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
└────────────────────┼─────────────────────────────────────┘
                     │
                     │ HTTP POST
                     │ Authorization: Bearer YOUR_API_KEY
                     │ Content-Type: application/json
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Patent AI Backend (Express + Vercel AI SDK)            │
│  http://localhost:8000                                  │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │  POST /v1/chat/completions                 │         │
│  │  src/routes/completions.ts                 │         │
│  │                                             │         │
│  │  - Receives OpenAI-compatible request      │         │
│  │  - Validates Bearer token                  │         │
│  │  - Calls Vercel AI SDK                     │         │
│  │  - Returns streaming/non-streaming response│         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────┐         │
│  │  Vercel AI SDK v5                           │         │
│  │  - streamText()                             │         │
│  │  - Tool calling                             │         │
│  │  - Multi-step workflows                     │         │
│  └─────────────────┬──────────────────────────┘         │
│                    │                                     │
└────────────────────┼─────────────────────────────────────┘
                     │
                     │ OpenAI API
                     ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Provider (OpenAI, Anthropic, etc.)                 │
│  - GPT-4, Claude, etc.                                  │
└─────────────────────────────────────────────────────────┘
```

---

## How It Works: Request Flow

### 1. User sends message in VS Code Chat UI

**Location:** VS Code Chat Panel (built-in UI)
- User types: "Search for prior art on wireless charging"
- VS Code calls registered chat participant

### 2. Extension receives chat request

**File:** `src/extension/extension/vscode-node/contributions.ts` (registered contributions)

The extension has registered a chat participant that handles all chat requests.

### 3. BYOK Provider resolves endpoint

**File:** `src/extension/byok/vscode-node/patentEndpointProvider.ts`

```typescript
async getChatEndpoint(): Promise<IChatEndpoint> {
  // Returns PatentChatEndpoint configured with:
  // - URL: http://localhost:8000/v1/chat/completions
  // - API Key: YOUR_PATENT_API_KEY
  return this.getOrCreatePatentChatEndpoint();
}
```

### 4. PatentChatEndpoint creates HTTP request

**File:** `src/extension/byok/node/patentChatEndpoint.ts`

```typescript
// Transforms VS Code chat request to OpenAI format
createRequestBody(options) {
  return {
    model: "gpt-4o",
    messages: [
      { role: "user", content: "Search for prior art..." }
    ],
    stream: true,
    tools: [...] // If using tool calling
  };
}

// Adds custom headers
getExtraHeaders() {
  return {
    'Authorization': `Bearer ${this._patentApiKey}`,
    'Content-Type': 'application/json',
    'X-Patent-AI-Client': 'vscode-copilot-chat'
  };
}
```

### 5. HTTP POST to Patent AI Backend

**Request:**
```http
POST http://localhost:8000/v1/chat/completions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Search for prior art..." }
  ],
  "stream": true
}
```

### 6. Backend processes request

**File:** `/Users/neoak/projects/patnet-ai-backend/src/routes/completions.ts`

```typescript
completionsRouter.post('/', async (req, res) => {
  // 1. Validate API key
  const apiKey = req.headers.authorization.replace('Bearer ', '');

  // 2. Extract OpenAI-compatible params
  const { model, messages, stream } = req.body;

  // 3. Call Vercel AI SDK
  const result = streamText({
    model: openai(model),
    messages,
    tools: {
      weather: tool({ ... }),
      convertTemp: tool({ ... })
    }
  });

  // 4. Stream response in OpenAI SSE format
  for await (const delta of result.textStream) {
    res.write(`data: ${JSON.stringify({
      id: 'chatcmpl-xxx',
      choices: [{ delta: { content: delta } }]
    })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

### 7. Extension receives streaming response

**File:** `src/extension/byok/node/patentChatEndpoint.ts`

```typescript
makeChatRequest2(options, token) {
  // Receives SSE stream from backend
  // Parses each chunk
  // Fires VS Code chat progress events
  // Updates chat UI in real-time
}
```

### 8. Chat UI updates with streamed text

VS Code Chat Panel displays the response as it streams in, character by character.

---

## Key Files You Need to Understand

### Extension Side (vscode-copilot-chat)

| File | Purpose |
|------|---------|
| `src/extension/extension/vscode-node/extension.ts` | Extension entry point - activates contributions |
| `src/extension/extension/vscode-node/contributions.ts` | Registers all extension features (chat, tools, providers) |
| `src/extension/byok/vscode-node/patentEndpointProvider.ts` | **YOUR CUSTOM PROVIDER** - Returns PatentChatEndpoint |
| `src/extension/byok/node/patentChatEndpoint.ts` | **YOUR CUSTOM ENDPOINT** - Makes HTTP requests to your backend |
| `src/extension/byok/node/patentAuthenticationService.ts` | **YOUR CUSTOM AUTH** - Manages Patent AI API keys |
| `src/extension/byok/vscode-node/baseOpenAICompatibleProvider.ts` | Base class for OpenAI-compatible providers (reference implementation) |

### Backend Side (patnet-ai-backend)

| File | Purpose |
|------|---------|
| `src/server.ts` | Express server entry point |
| `src/routes/completions.ts` | **OpenAI-compatible endpoint** for vscode-copilot-chat |
| `src/routes/chat.ts` | Your original chat endpoint (not used by extension) |
| `src/routes/oauth.ts` | Authentication endpoints for API key management |
| `src/routes/api.ts` | Protected API routes (tools, patent data, etc.) |

---

## Configuration & Setup

### 1. Backend Configuration

**Environment Variables (.env):**
```bash
# LLM Provider (OpenAI)
OPENAI_API_KEY=sk-proj-...

# Server Config
PORT=8000
NODE_ENV=development

# Patent AI API Keys (for extension authentication)
VALID_API_KEYS=test-api-key,flowleap-dev-key-123
```

### 2. Extension Configuration

**VS Code Settings (settings.json):**
```json
{
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions",
  "patent.apiKey": "test-api-key"
}
```

**Environment Variables (.env in vscode-copilot-chat):**
```bash
PATENT_API_URL=http://localhost:8000/v1/chat/completions
PATENT_API_KEY=test-api-key
```

### 3. FlowLeap IDE Configuration

When bundling the extension into FlowLeap Patent IDE, you can:

**Option A: Hardcode defaults in extension**
```typescript
// src/extension/byok/vscode-node/patentEndpointProvider.ts
private getPatentApiUrl(): string {
  return process.env.PATENT_API_URL || 'http://localhost:8000/v1/chat/completions';
}
```

**Option B: Use product.json for IDE-specific defaults**
```json
{
  "nameShort": "FlowLeap",
  "extensionDefaults": {
    "patent.apiUrl": "http://localhost:8000/v1/chat/completions",
    "patent.apiKey": "flowleap-default-key"
  }
}
```

---

## How LLM Models are Accessed

### Current Architecture (vscode-copilot-chat)

1. **Extension does NOT directly call LLM APIs**
2. **Extension only calls YOUR backend**
3. **Your backend calls LLM APIs** via Vercel AI SDK

```
┌──────────────────┐      HTTP       ┌──────────────────┐      OpenAI API      ┌──────────────────┐
│  VS Code         │  ────────────>  │  Your Backend    │  ─────────────────>  │  OpenAI GPT-4    │
│  Extension       │  Bearer token   │  (localhost:8000)│  Your OPENAI_API_KEY │  (claude, etc)   │
└──────────────────┘                 └──────────────────┘                      └──────────────────┘
```

### Why This Architecture?

**Advantages:**
- ✅ **Centralized LLM logic** - All model calls in one place (backend)
- ✅ **API key security** - Users never see your OpenAI API key
- ✅ **Custom tool calling** - Backend controls what tools are available
- ✅ **Multi-step workflows** - Backend can orchestrate complex agent flows
- ✅ **Patent-specific prompts** - Inject patent domain knowledge server-side
- ✅ **Usage tracking** - Monitor all LLM calls in one place
- ✅ **Model flexibility** - Switch LLM providers without changing extension

**How Vercel AI SDK Works in Your Backend:**

```typescript
// src/routes/completions.ts
import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';

const result = streamText({
  model: openai('gpt-4o'), // Uses OPENAI_API_KEY from .env
  messages,
  tools: {
    // Backend defines available tools
    searchPriorArt: tool({
      description: "Search for prior art",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        // Call OPS API, USPTO API, etc.
        return await fetchPriorArt(query);
      }
    })
  }
});

// Stream back to extension
for await (const delta of result.textStream) {
  res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
}
```

---

## Model Selection & Configuration

### How to Add Multiple Models

**Backend (src/routes/completions.ts):**
```typescript
const modelMap = {
  'patent-gpt-4': 'gpt-4o',
  'patent-claude': 'claude-3-5-sonnet-20241022',
  'patent-gemini': 'gemini-2.0-flash-exp'
};

const result = streamText({
  model: openai(modelMap[req.body.model] || 'gpt-4o'),
  // ...
});
```

**Extension (patentEndpointProvider.ts):**
```typescript
// Return multiple model options
private getPatentModelMetadata(): IChatModelInformation[] {
  return [
    {
      id: 'patent-gpt-4',
      name: 'Patent GPT-4',
      is_chat_default: true,
      // ...
    },
    {
      id: 'patent-claude',
      name: 'Patent Claude 3.5',
      is_chat_default: false,
      // ...
    }
  ];
}
```

---

## Tool Calling Integration

### Backend Tool Definition (Vercel AI SDK)

```typescript
// src/routes/completions.ts
const tools = {
  searchPriorArt: tool({
    description: "Search for prior art using OPS API",
    inputSchema: z.object({
      query: z.string(),
      classifications: z.array(z.string()).optional()
    }),
    execute: async ({ query, classifications }) => {
      // Call OPS API
      const results = await opsClient.search(query, classifications);
      return results;
    }
  }),

  analyzeNovelty: tool({
    description: "Analyze novelty of claims vs prior art",
    inputSchema: z.object({
      claims: z.string(),
      priorArt: z.array(z.string())
    }),
    execute: async ({ claims, priorArt }) => {
      // Your patent analysis logic
      return await analyzeNovelty(claims, priorArt);
    }
  })
};
```

### How Tools Flow Through System

```
1. User: "Search for prior art on wireless charging"
   ↓
2. Extension sends to backend: POST /v1/chat/completions
   ↓
3. Backend calls LLM with tools available
   ↓
4. LLM decides: "I need to use searchPriorArt tool"
   ↓
5. Backend executes: tools.searchPriorArt.execute({ query: "wireless charging" })
   ↓
6. Backend gets results: [{ patent: "US123456", title: "..." }]
   ↓
7. Backend sends results back to LLM
   ↓
8. LLM generates response: "I found 5 relevant patents..."
   ↓
9. Backend streams response to extension
   ↓
10. Extension displays in VS Code chat UI
```

---

## Authentication Flow

### Current Implementation

**Extension Side:**
```typescript
// patentChatEndpoint.ts
getExtraHeaders() {
  return {
    'Authorization': `Bearer ${this._patentApiKey}`
  };
}
```

**Backend Side:**
```typescript
// src/routes/completions.ts
const apiKey = req.headers.authorization.replace('Bearer ', '');

if (!apiKey || !VALID_API_KEYS.includes(apiKey)) {
  return res.status(401).json({ error: 'Invalid API key' });
}
```

### Production Authentication Options

**Option 1: OAuth2 Flow (Recommended)**
```typescript
// src/routes/oauth.ts
app.post('/oauth/token', async (req, res) => {
  const { username, password } = req.body;

  // Validate user
  const user = await validateUser(username, password);

  // Generate JWT token
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);

  res.json({ access_token: token });
});
```

**Option 2: API Key Management**
```typescript
// User generates API key in FlowLeap IDE settings
// Backend stores hashed keys in database
// Extension includes key in Authorization header
```

---

## Next Steps for FlowLeap Integration

### Phase 1: Test Current Integration

1. **Start backend:**
   ```bash
   cd /Users/neoak/projects/patnet-ai-backend
   npm run dev
   ```

2. **Build extension:**
   ```bash
   cd /Users/neoak/projects/vscode-copilot-chat
   npm install
   npm run watch
   ```

3. **Test in VS Code:**
   - Open vscode-copilot-chat in VS Code
   - Press F5 to launch Extension Development Host
   - Open chat panel
   - Send message
   - Check if it reaches your backend

### Phase 2: Bundle into FlowLeap IDE

1. **Build vscode-copilot-chat extension:**
   ```bash
   npm run package
   # Creates copilot-chat-x.x.x.vsix
   ```

2. **Copy to FlowLeap extensions folder:**
   ```bash
   cp copilot-chat-x.x.x.vsix /Users/neoak/projects/vscode/extensions/flowleap-copilot-chat/
   ```

3. **Update product.json:**
   ```json
   {
     "extensionsGallery": {
       "serviceUrl": "https://marketplace.visualstudio.com/_apis/public/gallery",
       "itemUrl": "https://marketplace.visualstudio.com/items"
     },
     "extensionDefaults": {
       "patent.apiUrl": "http://localhost:8000/v1/chat/completions"
     }
   }
   ```

### Phase 3: Add Patent-Specific Features

1. **Add patent tools to backend:**
   - OPS API integration
   - USPTO API integration
   - CQL query builder
   - Novelty analysis

2. **Add patent-specific chat participants:**
   - @patent-search
   - @novelty-analysis
   - @claim-mapping

3. **Add project memory:**
   - File-based project folders
   - .flowleap/ directory structure
   - Persistent context across sessions

---

## Debugging Tips

### Check if Backend is Receiving Requests

```bash
# In backend terminal
npm run dev

# You should see:
[2025-01-23T...] POST /v1/chat/completions
[Patent AI] Chat request from VSCode: { model: 'gpt-4o', messageCount: 1, ... }
```

### Check Extension Logs

In VS Code Extension Development Host:
- Open Output panel (Cmd+Shift+U)
- Select "GitHub Copilot" or "Extension Host"
- Look for `[Patent AI]` log messages

### Test Backend Directly

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

---

## Common Issues & Solutions

### Issue 1: "No default agent contributed"

**Cause:** Extension not registered as chat participant in FlowLeap IDE

**Solution:** Ensure extension is activated and contributions are registered
```typescript
// Check contributions.ts - should register chat participant
```

### Issue 2: "Connection refused to localhost:8000"

**Cause:** Backend not running or wrong URL

**Solution:**
```bash
# Start backend
cd patnet-ai-backend
npm run dev

# Check extension config
# VS Code Settings → patent.apiUrl
```

### Issue 3: "Invalid API key"

**Cause:** API key mismatch between extension and backend

**Solution:**
```bash
# Extension: .env or VS Code settings
PATENT_API_KEY=test-api-key

# Backend: .env
VALID_API_KEYS=test-api-key
```

---

## Summary

**How the Extension Works:**
1. Extension registers as **BYOK (Bring Your Own Key) provider**
2. When user sends chat message, extension calls **PatentChatEndpoint**
3. PatentChatEndpoint makes **HTTP POST** to your backend at `localhost:8000/v1/chat/completions`
4. Backend uses **Vercel AI SDK** to call OpenAI/Anthropic/etc
5. Backend **streams response** back to extension
6. Extension **displays in chat UI**

**How LLM Models are Brought In:**
- Extension **NEVER** calls LLM APIs directly
- Backend calls LLMs via **Vercel AI SDK** using your `OPENAI_API_KEY`
- This keeps API keys secure and allows centralized control

**What You Have:**
- ✅ Custom `PatentEndpointProvider` (extension → backend connection)
- ✅ Custom `PatentChatEndpoint` (HTTP request handler)
- ✅ OpenAI-compatible backend endpoint (`/v1/chat/completions`)
- ✅ Vercel AI SDK integration for LLM calls
- ✅ Tool calling support

**What You Need:**
- 🔲 Test the integration end-to-end
- 🔲 Add patent-specific tools (OPS API, novelty analysis, etc.)
- 🔲 Bundle extension into FlowLeap IDE
- 🔲 Add authentication/API key management
- 🔲 Implement project memory system

Let me know which part you want to work on first!
