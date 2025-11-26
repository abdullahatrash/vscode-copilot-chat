# Architecture Comparison: GitHub Copilot vs FlowLeap Patent IDE

## Current Architecture (GitHub Copilot)

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code UI                                │
│                    (Chat Panel, Inline)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LanguageModelAccess                             │
│              (VS Code API Implementation)                        │
│  - Validates requests                                            │
│  - Counts tokens                                                 │
│  - Adds safety rules                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CopilotLanguageModelWrapper                         │
│  - Wraps endpoint with Proxy                                     │
│  - Injects extension metadata headers                            │
│  - Requires Copilot Token ⚠️                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────┴────────────────────┐
        │                                          │
        ▼                                          ▼
┌──────────────────┐                    ┌──────────────────────┐
│  ChatEndpoint    │                    │  OpenAIEndpoint      │
│  (CAPI Routing)  │                    │  (BYOK Models)       │
└────────┬─────────┘                    └──────────┬───────────┘
         │                                          │
         ▼                                          ▼
┌──────────────────┐                    ┌──────────────────────┐
│ RequestMetadata  │                    │   Direct URL         │
│ - ChatCompletions│                    │   (OpenAI/Azure)     │
│ - ChatResponses  │                    └──────────┬───────────┘
└────────┬─────────┘                               │
         │                                          │
         ▼                                          │
┌─────────────────────────────────────────┐        │
│       CAPIClient                        │        │
│  (@vscode/copilot-api package)          │        │
│  - Maps RequestType → URL               │        │
│  - Injects Copilot Token ⚠️             │        │
│  - Routes to GitHub domains             │        │
└────────┬────────────────────────────────┘        │
         │                                          │
         ▼                                          │
┌─────────────────────────────────────────┐        │
│    GitHub Copilot API (CAPI)            │        │
│    https://api.githubcopilot.com        │◄───────┘
│  - Requires GitHub authentication ⚠️    │
│  - /chat/completions                    │
│  - /responses                           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│   Backend LLM Providers                 │
│   (OpenAI, Azure, Anthropic)            │
└─────────────────────────────────────────┘
```

### Key Dependencies (⚠️ = Blocker for your use case)
- ⚠️ **GitHub Authentication**: Requires active GitHub session
- ⚠️ **Copilot Token**: Must mint token from GitHub API
- ⚠️ **CAPI Client**: Hardcoded GitHub domain routing
- **Agent Brain**: Tool loop, prompts, workspace context ✅

---

## Target Architecture (FlowLeap Patent IDE)

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code UI                                │
│                    (Chat Panel, Inline)                          │
│                  "FlowLeap Patent IDE"                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LanguageModelAccess                             │
│              (VS Code API Implementation)                        │
│  - Validates requests                                            │
│  - Counts tokens                                                 │
│  - Adds safety rules                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CopilotLanguageModelWrapper                         │
│  - Wraps endpoint with Proxy                                     │
│  - Injects extension metadata headers                            │
│  - MODIFIED: Bypass token check for FlowLeap ✅                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 FlowLeapEndpoint                                 │
│             (extends OpenAIEndpoint)                             │
│  - Direct HTTP to your backend                                   │
│  - Custom headers (X-FlowLeap-Client, etc.)                      │
│  - API key from config or env var                                │
│  - NO GitHub dependencies ✅                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Direct HTTP Request                           │
│              http://localhost:8000/v1/chat/completions           │
│  Headers:                                                        │
│    - Authorization: Bearer <your-api-key>                        │
│    - X-FlowLeap-Client: vscode-extension                         │
│    - X-FlowLeap-Version: 0.1.0                                   │
│  Body: OpenAI-compatible format                                  │
│    - messages: [...]                                             │
│    - tools: [...]                                                │
│    - model: "flowleap-patent-gpt"                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Your Backend (patent-ai-backend)                    │
│              http://localhost:8000                               │
│  Routes:                                                         │
│    POST /v1/chat/completions                                     │
│    POST /api/patent/search                                       │
│    POST /api/patent/analyze                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Your LLM Provider                                   │
│       (OpenAI, Claude, or custom model)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Removed Dependencies ✅
- ✅ **No GitHub Authentication**: Removed dependency
- ✅ **No Copilot Token**: Bypassed in wrapper
- ✅ **No CAPI Client**: Direct HTTP calls
- ✅ **Agent Brain Retained**: Same tool loop, prompts, context

---

## Tool Architecture Comparison

### Current (GitHub Copilot)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Language Model Tools                          │
├─────────────────────────────────────────────────────────────────┤
│  Core Tools (keep these ✅):                                     │
│    - readFile                                                    │
│    - listDirectory                                               │
│    - executeCommand                                              │
│    - searchFiles                                                 │
│    - insertText                                                  │
│                                                                  │
│  GitHub-Specific Tools (remove these ⚠️):                        │
│    - gh_pr_review                                                │
│    - gh_issue_create                                             │
│    - gh_cli                                                      │
│    - github_repo_search                                          │
│                                                                  │
│  Claude Code CLI Tools (remove these ⚠️):                        │
│    - bash_execute                                                │
│    - file_edit                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Target (FlowLeap Patent IDE)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Language Model Tools                          │
├─────────────────────────────────────────────────────────────────┤
│  Core Tools (retained ✅):                                       │
│    - readFile                                                    │
│    - listDirectory                                               │
│    - executeCommand                                              │
│    - searchFiles                                                 │
│    - insertText                                                  │
│                                                                  │
│  NEW Patent Tools (add these ✅):                                │
│    - patent_search                                               │
│        → Search USPTO/EPO/WIPO databases                         │
│    - analyze_patent                                              │
│        → Analyze patent claims, prior art, prosecution history   │
│    - draft_claims                                                │
│        → Generate patent claim drafts                            │
│    - compare_patents                                             │
│        → Compare claims across patents                           │
│    - citation_analysis                                           │
│        → Analyze forward/backward citations                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Prompt Architecture

### Current Identity

```
System Message:
  "You are GitHub Copilot, an AI coding assistant.
   You help developers write code, fix bugs, and explain code.
   You have access to the user's workspace and can read files."

Tools: Core file/directory tools + GitHub-specific tools
```

### Target Identity

```
System Message:
  "You are FlowLeap Patent IDE, an AI assistant specialized in patent prosecution.

   You help patent professionals with:
   - Prior art search and analysis
   - Patent claim drafting and refinement
   - Office action response preparation
   - Patent landscape analysis
   - USPTO/EPO/WIPO database queries

   You have access to:
   - The user's workspace and patent project files
   - Patent database search tools
   - Patent analysis and citation tools
   - Claim drafting templates and guidelines

   Always:
   - Cite patent numbers with proper formatting (US1234567, EP1234567)
   - Use patent search tools before making claims about prior art
   - Maintain claim numbering consistency
   - Follow USPTO/EPO formatting guidelines"

Tools: Core file/directory tools + Patent-specific tools
```

---

## Authentication Flow Comparison

### Current (GitHub Copilot)

```
User Opens Chat
    │
    ▼
Check GitHub Session
    │
    ├─ No Session → Prompt to sign in → BLOCKED ⚠️
    │
    ▼ (has session)
Get GitHub Token
    │
    ▼
Mint Copilot Token
    │  (POST to GitHub API)
    │  Authorization: token <github-token>
    │
    ▼
Cache Copilot Token
    │  {
    │    token: "...",
    │    endpoints: { api: "https://api.githubcopilot.com" },
    │    expires_at: 1234567890
    │  }
    │
    ▼
Use Token in Requests
    Authorization: Bearer <copilot-token>
```

### Target (FlowLeap Patent IDE)

```
User Opens Chat
    │
    ▼
Check FlowLeap Config
    │  flowleap.enabled = true
    │  flowleap.apiUrl = "http://localhost:8000/v1/chat/completions"
    │  flowleap.apiKey = "" (optional)
    │
    ▼
Bypass Copilot Token Check ✅
    │  if (endpoint instanceof FlowLeapEndpoint) {
    │    // Skip GitHub token requirement
    │  }
    │
    ▼
Use API Key in Requests (optional)
    Authorization: Bearer <your-api-key>  (if configured)
    OR
    Custom auth mechanism you define
```

---

## Configuration Comparison

### Current (GitHub Copilot)

```json
{
  "github.copilot.enable": true,
  "github.copilot.advanced.authProvider": "github",
  "github.copilot.advanced.debug.overrideCapiUrl": "",
  "github.copilot.chat.model": "gpt-4o"
}
```

### Target (FlowLeap Patent IDE)

```json
{
  "flowleap.enabled": true,
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions",
  "flowleap.apiKey": "",
  "flowleap.defaultModel": "flowleap-patent-gpt",
  "flowleap.patentDatabases": ["uspto", "epo", "wipo"],
  "flowleap.enableTelemetry": false
}
```

---

## Request/Response Format

### Request to Your Backend

```json
POST http://localhost:8000/v1/chat/completions
Headers:
  Content-Type: application/json
  Authorization: Bearer <your-api-key>
  X-FlowLeap-Client: vscode-extension
  X-FlowLeap-Version: 0.1.0

Body:
{
  "model": "flowleap-patent-gpt",
  "messages": [
    {
      "role": "system",
      "content": "You are FlowLeap Patent IDE..."
    },
    {
      "role": "user",
      "content": "Search for patents related to neural networks"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "patent_search",
        "description": "Search patent databases",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "database": { "type": "string", "enum": ["uspto", "epo", "wipo", "all"] },
            "limit": { "type": "number" }
          },
          "required": ["query"]
        }
      }
    }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### Response from Your Backend (OpenAI-compatible)

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "flowleap-patent-gpt",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "patent_search",
              "arguments": "{\"query\":\"neural networks\",\"database\":\"all\",\"limit\":10}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  }
}
```

---

## Conversion Summary

| Component | Current | Target | Change Required |
|-----------|---------|--------|-----------------|
| **Extension Name** | `copilot-chat` | `flowleap-patent-ide` | package.json |
| **Authentication** | GitHub + Copilot Token | Optional API key | Bypass in wrapper |
| **Backend URL** | `api.githubcopilot.com` | `localhost:8000` | FlowLeapEndpoint |
| **Request Routing** | CAPIClient → CAPI | Direct HTTP | OpenAIEndpoint pattern |
| **Agent Identity** | GitHub Copilot | FlowLeap Patent IDE | Prompt files |
| **Tools** | Code-focused | Patent-focused | Add patent tools |
| **Model** | `gpt-4o`, `claude-3.5` | `flowleap-patent-gpt` | Config + metadata |

---

## Key Insights

1. **The agent brain is independent of the backend**
   - Tool loop, prompt rendering, workspace context all stay the same
   - Only the "endpoint layer" needs to change

2. **OpenAIEndpoint is your friend**
   - Already supports direct URL routing (no CAPI)
   - Already handles OpenAI-compatible request/response format
   - Just extend it and point to your backend

3. **Token check is the only blocker**
   - One small modification in `CopilotLanguageModelWrapper`
   - Bypass GitHub token requirement for FlowLeap models

4. **Tool system is extensible**
   - Tools are just VS Code `LanguageModelTool` implementations
   - Register in `toolRegistry.ts`, and they become available to LLM
   - Your backend doesn't implement tools - the extension does!

5. **You can keep all the mature agent features**
   - Multi-turn conversations
   - Workspace context awareness
   - Inline editing
   - Streaming responses
   - Token counting
   - Safety rules

---

## Next Steps

1. Run the conversion script: `bash scripts/convert-to-flowleap.sh`
2. Follow the manual steps in `FLOWLEAP_CONVERSION_GUIDE.md`
3. Test with your backend at `http://localhost:8000`
4. Iterate on prompts and tools
5. Package and distribute

Good luck! 🚀
