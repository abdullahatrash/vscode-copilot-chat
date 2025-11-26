# Patent AI Backend Integration Plan

> Complete step-by-step plan for integrating your custom patent AI backend with VSCode Copilot Chat extension

**Status**: ✅ Ready to implement
**Effort**: 10-20 hours
**Backend Location**: `/Users/neoak/projects/patnet-ai-backend/src`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Steps](#implementation-steps)
4. [File Structure](#file-structure)
5. [Testing Plan](#testing-plan)
6. [Backend Requirements](#backend-requirements)

---

## Overview

### What We're Building

A custom authentication and endpoint system that:
- ✅ Bypasses GitHub authentication completely
- ✅ Uses YOUR patent AI backend at `localhost:8000`
- ✅ Integrates with full agent features (tools, context, ReAct loop)
- ✅ Works with existing VSCode Copilot Chat UI
- ✅ Requires ZERO changes to core agent code

### Strategy

**Mock Authentication Pattern**:
```
VSCode Extension
    │
    ├─> Mock IAuthenticationService (returns fake token)
    │       └─> Mock CopilotToken (all features enabled)
    │
    ├─> Agent Code (unchanged, checks mock token)
    │       └─> Enables all tools and features
    │
    └─> Custom ChatEndpoint (uses YOUR API key)
            └─> Patent AI Backend (localhost:8000)
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│         VSCode Extension Host                           │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  PatentAuthenticationService                      │ │
│  │  implements IAuthenticationService                │ │
│  │                                                    │ │
│  │  • Always returns "authenticated"                 │ │
│  │  • Mock CopilotToken with all features enabled    │ │
│  │  • No actual GitHub API calls                     │ │
│  └──────────────────┬────────────────────────────────┘ │
│                     │                                   │
│                     ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Agent Code (UNCHANGED)                           │ │
│  │                                                    │ │
│  │  • token.isChatEnabled() → true                   │ │
│  │  • token.isChatQuotaExceeded() → false            │ │
│  │  • token.isMcpEnabled() → true                    │ │
│  │  • All tools available                            │ │
│  └──────────────────┬────────────────────────────────┘ │
│                     │                                   │
│                     ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │  PatentChatEndpoint                               │ │
│  │  extends ChatEndpoint                             │ │
│  │                                                    │ │
│  │  • getExtraHeaders() → Bearer YOUR_API_KEY        │ │
│  │  • urlOrRequestMetadata → localhost:8000/v1       │ │
│  └──────────────────┬────────────────────────────────┘ │
│                     │                                   │
└─────────────────────┼───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Patent AI Backend          │
        │  localhost:8000/v1          │
        │                             │
        │  POST /chat/completions     │
        │  Authorization: Bearer key  │
        └─────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Mock Authentication Service (4 hours)

#### File: `src/extension/byok/node/patentAuthenticationService.ts`

```typescript
import { IAuthenticationService, GITHUB_SCOPE_ALIGNED } from '../../../platform/authentication/common/authentication';
import { CopilotToken, ExtendedTokenInfo } from '../../../platform/authentication/common/copilotToken';
import { Event, Emitter } from '../../../util/vs/base/common/event';
import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';

/**
 * Mock authentication service for Patent AI backend
 * Returns a fake CopilotToken with all features enabled
 * No actual GitHub authentication required
 */
export class PatentAuthenticationService implements IAuthenticationService {
    readonly _serviceBrand: undefined;

    private _mockToken: CopilotToken;
    private _mockSession: AuthenticationSession;

    private readonly _onDidAuthenticationChange = new Emitter<void>();
    readonly onDidAuthenticationChange: Event<void> = this._onDidAuthenticationChange.event;

    private readonly _onDidAccessTokenChange = new Emitter<void>();
    readonly onDidAccessTokenChange: Event<void> = this._onDidAccessTokenChange.event;

    private readonly _onDidAdoAuthenticationChange = new Emitter<void>();
    readonly onDidAdoAuthenticationChange: Event<void> = this._onDidAdoAuthenticationChange.event;

    constructor() {
        // Create mock GitHub session
        this._mockSession = {
            id: 'patent-ai-session',
            accessToken: 'mock-github-token-not-used',
            account: {
                id: 'patent-ai-user',
                label: 'Patent AI User'
            },
            scopes: GITHUB_SCOPE_ALIGNED // Full permissive scopes
        };

        // Create mock Copilot token with ALL features enabled
        this._mockToken = this.createMockToken();
    }

    //#region IAuthenticationService implementation

    get isMinimalMode(): boolean {
        return false; // Always full permissions
    }

    get anyGitHubSession(): AuthenticationSession | undefined {
        return this._mockSession;
    }

    async getAnyGitHubSession(_options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
        return this._mockSession;
    }

    get permissiveGitHubSession(): AuthenticationSession | undefined {
        return this._mockSession; // Same as any session - full permissions
    }

    async getPermissiveGitHubSession(_options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
        return this._mockSession;
    }

    get copilotToken(): Omit<CopilotToken, 'token'> | undefined {
        return this._mockToken;
    }

    async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
        return this._mockToken;
    }

    resetCopilotToken(_httpError?: number): void {
        // No-op - token never expires
    }

    get speculativeDecodingEndpointToken(): string | undefined {
        return undefined; // Not used
    }

    async getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
        return undefined; // Not using Azure DevOps
    }

    //#endregion

    /**
     * Create a mock CopilotToken with all features enabled
     */
    private createMockToken(): CopilotToken {
        const mockTokenInfo: ExtendedTokenInfo = {
            // Token string (fields:mac format, not actually used by custom endpoint)
            token: 'patent_ai=1;chat=1;tools=1;mcp=1:mock_signature',

            // Expiration - set to 24 hours from now
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            refresh_in: 3600,

            // User identity
            username: 'patent-ai-user',
            sku: 'patent_ai_enterprise',
            copilot_plan: 'enterprise',

            // Organization (empty - not using GitHub)
            organization_list: [],
            enterprise_list: [],

            // ✅ ENABLE ALL FEATURES
            chat_enabled: true,                      // Enable chat
            copilotignore_enabled: false,            // Not using .copilotignore
            code_quote_enabled: false,               // No code citation
            public_suggestions: 'enabled',           // Allow suggestions
            telemetry: 'disabled',                   // No telemetry to GitHub

            // ✅ NO QUOTAS (unlimited)
            limited_user_quotas: undefined,
            quota_snapshots: undefined,
            quota_reset_date: undefined,

            // Mock endpoints (not used by custom endpoint)
            endpoints: {
                api: 'http://localhost:8000',
                proxy: 'http://localhost:8000',
                telemetry: undefined
            },

            // User flags
            individual: false,
            isVscodeTeamMember: false,

            // Advanced features
            blackbird_clientside_indexing: true,     // Enable local indexing
            codex_agent_enabled: true,               // Enable agent features
        };

        return new CopilotToken(mockTokenInfo);
    }
}
```

---

### Phase 2: Custom Chat Endpoint (4 hours)

#### File: `src/extension/byok/node/patentChatEndpoint.ts`

```typescript
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatModelInformation } from '../../../platform/models/common/chatModels';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

/**
 * Custom endpoint for Patent AI backend
 * Uses custom API key instead of GitHub Copilot token
 */
export class PatentChatEndpoint extends ChatEndpoint {
    constructor(
        modelMetadata: IChatModelInformation,
        private readonly patentApiKey: string,
        private readonly patentApiUrl: string,
        @IAuthenticationService authenticationService: IAuthenticationService,
        @IFetcherService fetcherService: IFetcherService,
        @ILogService logService: ILogService,
        @IInstantiationService instantiationService: IInstantiationService,
    ) {
        super(
            modelMetadata,
            authenticationService,
            fetcherService,
            logService,
            instantiationService,
        );
    }

    /**
     * Override to use custom API key instead of GitHub token
     */
    override getExtraHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.patentApiKey}`,
            'X-Patent-AI-Client': 'vscode-copilot-chat',
            'X-Patent-AI-Version': '1.0.0',
        };
    }

    /**
     * Override to use custom API URL
     */
    override get urlOrRequestMetadata(): string {
        return this.patentApiUrl;
    }

    /**
     * Skip GitHub policy acceptance
     */
    override async acceptChatPolicy(): Promise<boolean> {
        return true; // No policy to accept
    }

    /**
     * Override model family for custom behavior
     */
    override get family(): string {
        return 'patent-ai';
    }
}
```

---

### Phase 3: Service Registration (2 hours)

#### File: `src/extension/byok/vscode-node/patentContribution.ts`

```typescript
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../extension/common/contribution';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { PatentAuthenticationService } from '../node/patentAuthenticationService';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';

/**
 * Contribution for Patent AI backend integration
 * Registers mock authentication service when Patent mode is enabled
 */
export class PatentContribution extends Disposable implements IExtensionContribution {
    constructor(
        @ILogService private readonly logService: ILogService,
        @IInstantiationService private readonly instantiationService: IInstantiationService,
        @IConfigurationService private readonly configService: IConfigurationService,
    ) {
        super();
        this.initialize();
    }

    private initialize(): void {
        const isPatentMode = this.configService.getConfig<boolean>('patent.enabled') ?? false;

        if (isPatentMode) {
            this.logService.info('[Patent AI] Initializing Patent AI backend integration');

            // The service will be registered in services.ts
            // This contribution just logs and validates config

            const apiKey = this.configService.getConfig<string>('patent.apiKey');
            const apiUrl = this.configService.getConfig<string>('patent.apiUrl') ?? 'http://localhost:8000/v1/chat/completions';

            if (!apiKey) {
                this.logService.warn('[Patent AI] API key not configured. Set patent.apiKey in settings.');
            } else {
                this.logService.info(`[Patent AI] Backend URL: ${apiUrl}`);
            }
        }
    }
}
```

---

### Phase 4: DI Container Registration (2 hours)

#### Modify: `src/extension/extension/vscode-node/services.ts`

Add the Patent mode check and service registration:

```typescript
// At the top with other imports
import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';

// In the service registration section (around line 150-200)
// Find where IAuthenticationService is registered

// Add this check BEFORE the existing auth service registration
const isPatentMode = context.globalState.get<boolean>('patent.enabled', false) ||
                     process.env.PATENT_AI_MODE === 'true';

if (isPatentMode) {
    // ✅ Use Patent AI mock authentication
    builder.define(IAuthenticationService,
        new SyncDescriptor(PatentAuthenticationService));
    logService.info('[Patent AI] Using Patent AI authentication service');
} else if (isTestMode || isScenarioAutomation) {
    // Test mode - static token
    builder.define(IAuthenticationService,
        new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
} else {
    // Production - GitHub auth
    builder.define(IAuthenticationService,
        new SyncDescriptor(AuthenticationService));
}
```

---

### Phase 5: Configuration (1 hour)

#### Add to: `package.json`

```json
{
  "contributes": {
    "configuration": {
      "title": "Patent AI",
      "properties": {
        "patent.enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable Patent AI backend integration (bypasses GitHub authentication)"
        },
        "patent.apiKey": {
          "type": "string",
          "default": "",
          "description": "API key for Patent AI backend"
        },
        "patent.apiUrl": {
          "type": "string",
          "default": "http://localhost:8000/v1/chat/completions",
          "description": "Patent AI backend API URL"
        },
        "patent.modelId": {
          "type": "string",
          "default": "patent-gpt",
          "description": "Model ID to use with Patent AI backend"
        }
      }
    }
  }
}
```

#### User Configuration: `.vscode/settings.json`

```json
{
  "patent.enabled": true,
  "patent.apiKey": "your-api-key-here",
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions",
  "patent.modelId": "patent-gpt"
}
```

#### Environment Variables (Alternative)

```bash
export PATENT_AI_MODE=true
export PATENT_API_KEY="your-api-key"
export PATENT_API_URL="http://localhost:8000/v1/chat/completions"
```

---

## File Structure

### New Files to Create

```
vscode-copilot-chat/
├── src/
│   └── extension/
│       └── byok/
│           ├── node/
│           │   ├── patentAuthenticationService.ts    [NEW - 150 lines]
│           │   └── patentChatEndpoint.ts             [NEW - 80 lines]
│           └── vscode-node/
│               └── patentContribution.ts             [NEW - 50 lines]
```

### Files to Modify

```
vscode-copilot-chat/
├── src/
│   └── extension/
│       └── extension/
│           └── vscode-node/
│               └── services.ts                       [MODIFY - add 10 lines]
├── package.json                                      [MODIFY - add config section]
└── .vscode/
    └── settings.json                                 [CREATE/MODIFY - user config]
```

**Total New Code**: ~280 lines
**Total Modifications**: ~15 lines

---

## Testing Plan

### Unit Tests

#### Test 1: Mock Authentication Service

```typescript
// File: src/extension/byok/node/test/patentAuthenticationService.spec.ts

import { PatentAuthenticationService } from '../patentAuthenticationService';

describe('PatentAuthenticationService', () => {
    let authService: PatentAuthenticationService;

    beforeEach(() => {
        authService = new PatentAuthenticationService();
    });

    it('should always be authenticated', async () => {
        const session = await authService.getAnyGitHubSession();
        expect(session).toBeDefined();
        expect(session?.id).toBe('patent-ai-session');
    });

    it('should return token with all features enabled', async () => {
        const token = await authService.getCopilotToken();
        expect(token.isChatEnabled()).toBe(true);
        expect(token.isChatQuotaExceeded()).toBe(false);
        expect(token.isMcpEnabled()).toBe(true);
        expect(token.codexAgentEnabled).toBe(true);
    });

    it('should not be in minimal mode', () => {
        expect(authService.isMinimalMode).toBe(false);
    });

    it('should have permissive session', async () => {
        const session = await authService.getPermissiveGitHubSession({ silent: true });
        expect(session).toBeDefined();
        expect(session?.scopes).toContain('repo');
    });
});
```

#### Test 2: Custom Endpoint

```typescript
// File: src/extension/byok/node/test/patentChatEndpoint.spec.ts

import { PatentChatEndpoint } from '../patentChatEndpoint';

describe('PatentChatEndpoint', () => {
    it('should use custom API key in headers', () => {
        const endpoint = createTestEndpoint('test-api-key', 'http://localhost:8000');
        const headers = endpoint.getExtraHeaders();

        expect(headers['Authorization']).toBe('Bearer test-api-key');
        expect(headers['X-Patent-AI-Client']).toBe('vscode-copilot-chat');
    });

    it('should use custom URL', () => {
        const endpoint = createTestEndpoint('test-key', 'http://localhost:8000/v1');
        expect(endpoint.urlOrRequestMetadata).toBe('http://localhost:8000/v1');
    });
});
```

### Integration Tests

#### Test 3: End-to-End Chat Flow

```bash
# 1. Start your patent AI backend
cd /Users/neoak/projects/patnet-ai-backend
npm run dev  # Assuming this starts on localhost:8000

# 2. Configure VSCode extension
echo '{
  "patent.enabled": true,
  "patent.apiKey": "test-key",
  "patent.apiUrl": "http://localhost:8000/v1/chat/completions"
}' > .vscode/settings.json

# 3. Build and run extension
npm run watch  # In vscode-copilot-chat directory
# Press F5 to launch Extension Development Host

# 4. Test in Extension Host
# - Open Copilot Chat panel
# - Send message: "Hello, search patents"
# - Verify response comes from your backend
# - Check backend logs to confirm request received
```

#### Test 4: Tool Calling

```typescript
// In Extension Development Host, test tool calls
// Send message: "Use the patent_search tool to find AI patents"
// Expected:
// 1. Agent recognizes patent_search tool
// 2. Makes tool call request to backend
// 3. Backend executes tool
// 4. Response displayed in chat
```

### Manual Testing Checklist

- [ ] Extension activates with patent mode enabled
- [ ] No GitHub sign-in prompt shown
- [ ] Chat panel opens successfully
- [ ] Can send messages to backend
- [ ] Backend receives correct API key in headers
- [ ] Streaming responses work
- [ ] Multi-turn conversations work
- [ ] Tool calling works (if backend supports it)
- [ ] Context injection works (workspace files, etc.)
- [ ] Error handling works (backend down, invalid API key)

---

## Backend Requirements

### Your Patent AI Backend Must Support

#### 1. OpenAI-Compatible Chat Completions Endpoint

```http
POST http://localhost:8000/v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "patent-gpt",
  "messages": [
    {"role": "system", "content": "You are a patent AI assistant..."},
    {"role": "user", "content": "Search patents for AI agents"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

#### 2. Streaming Response Format

```
data: {"id":"1","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"1","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"content":"I'll"},"finish_reason":null}]}

data: {"id":"1","object":"chat.completion.chunk","created":1234567890,"model":"patent-gpt","choices":[{"index":0,"delta":{"content":" search"},"finish_reason":null}]}

data: [DONE]
```

#### 3. Tool Calling Support (Optional but Recommended)

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
            "query": {"type": "string", "description": "Search query"},
            "jurisdiction": {"type": "string", "enum": ["US", "EP", "CN"]}
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

#### 4. Error Response Format

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

### Backend Checklist

Your backend at `/Users/neoak/projects/patnet-ai-backend/src` needs:

- [ ] POST /v1/chat/completions endpoint
- [ ] Bearer token authentication
- [ ] OpenAI-compatible request/response format
- [ ] Server-Sent Events (SSE) for streaming
- [ ] CORS headers (if needed)
- [ ] Error handling (401, 500, etc.)
- [ ] Tool calling support (optional)
- [ ] Rate limiting (optional)

### Example Backend Structure

Based on your existing routes, you likely have:

```
patnet-ai-backend/src/
├── routes/
│   ├── chat.ts          ← Main chat endpoint
│   └── health.ts        ← Health check
├── services/
│   ├── llm.ts           ← LLM integration
│   └── patentSearch.ts  ← Patent search logic
└── index.ts             ← Server entry point
```

Ensure `chat.ts` implements OpenAI-compatible format!

---

## Troubleshooting

### Issue 1: Extension doesn't activate

**Solution**: Check VSCode Output panel for errors
```bash
# View logs
CMD + Shift + P → "Developer: Show Logs" → "Extension Host"
```

### Issue 2: Still shows GitHub sign-in

**Solution**: Verify patent mode is enabled
```typescript
// Check in Extension Development Host console
console.log(process.env.PATENT_AI_MODE);
// Should be 'true'
```

### Issue 3: Backend not receiving requests

**Solution**: Check URL and CORS
```bash
# Verify backend is running
curl http://localhost:8000/v1/health

# Check CORS headers
curl -H "Origin: vscode-file://vscode-app" \
     -H "Authorization: Bearer test-key" \
     -X POST http://localhost:8000/v1/chat/completions
```

### Issue 4: Tool calls not working

**Solution**: Verify backend supports `tools` parameter and returns `tool_calls` in response

---

## Next Steps

1. **Create mock authentication service** (now)
2. **Create custom endpoint** (after auth service)
3. **Register services in DI container** (after endpoint)
4. **Test with your backend** (after registration)
5. **Add custom patent tools** (future enhancement)

---

## Success Criteria

✅ **Phase 1 Complete When**:
- No GitHub sign-in prompt
- Extension activates successfully
- Mock token has all features enabled

✅ **Phase 2 Complete When**:
- Can send chat messages
- Backend receives requests with correct API key
- Responses display in chat panel

✅ **Phase 3 Complete When**:
- Full conversation flow works
- Tool calling works
- Context injection works

---

**Generated**: 2025-11-20
**For**: Patent AI Backend Integration
**Backend**: `/Users/neoak/projects/patnet-ai-backend/src`
