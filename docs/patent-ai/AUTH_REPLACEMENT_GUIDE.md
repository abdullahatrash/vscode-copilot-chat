# Authentication Replacement Guide

> Can you replace GitHub auth with your own? YES - with mock implementation. Here's how.

---

## TL;DR - Quick Answer

**Can you replace the auth?** ✅ **YES**

**Do you need a similar backend?** ⚠️ **NO - but you need to mock the token structure**

**Best approach:** Create a **mock CopilotToken** that makes the agent think you're authenticated with full permissions, then use your own API key in the endpoint.

**Effort:** 10-20 hours for full agent integration

---

## Current State Analysis

### What You Have (FlowLeap Provider)

**File:** [src/extension/byok/vscode-node/flowleapProvider.ts](src/extension/byok/vscode-node/flowleapProvider.ts)

```typescript
export class FlowLeapProvider extends BaseOpenAICompatibleLMProvider {
    constructor(/* ... */) {
        super(
            BYOKAuthType.None,  // ✅ NO AUTH REQUIRED
            'FlowLeap',
            'http://localhost:8000/v1',
            knownModels
        );
    }
}
```

**Status:** ✅ Working as Language Model Provider

**Limitations:**
- ❌ Can't access agent features (tools, context)
- ❌ Not integrated with Copilot chat UI
- ❌ Separate from main agent code

### What You Need (Agent Integration)

To use the full agent (tools, context, ReAct loop), you need:

1. Mock `IAuthenticationService`
2. Mock `CopilotToken` with feature flags
3. Custom endpoint with your API key
4. Register in the service container

---

## Coupling Analysis

### 🟢 Good News: Clean Abstraction Points

The auth system IS abstracted behind interfaces:

```typescript
// The agent code uses this interface
interface IAuthenticationService {
    getCopilotToken(force?: boolean): Promise<CopilotToken>;
    getAnyGitHubSession(): Promise<AuthenticationSession | undefined>;
    // ... more methods
}
```

**Dependency Injection Pattern:**
```typescript
// Agent code receives auth via DI
class AgentService {
    constructor(
        @IAuthenticationService private authService: IAuthenticationService
    ) {}

    async doWork() {
        const token = await this.authService.getCopilotToken();
        // Use token
    }
}
```

**Key Insight:** The agent doesn't create auth services directly - they're injected. You can inject your own!

### 🟡 Challenge: CopilotToken Structure

The agent code expects a `CopilotToken` with specific properties:

```typescript
class CopilotToken {
    // Required by agent code
    chat_enabled: boolean;           // Must be true
    isChatQuotaExceeded(): boolean;  // Must return false
    isMcpEnabled(): boolean;         // Tool availability
    isInternal(): boolean;           // Feature flags
    organization_list: string[];     // Org checks
    // ... many more
}
```

**Solution:** Return a mock token with all features enabled!

### 🟢 Good News: OpenAI Provider Pattern Exists

**File:** [src/extension/byok/node/openAIEndpoint.ts](src/extension/byok/node/openAIEndpoint.ts)

```typescript
export class OpenAIEndpoint extends ChatEndpoint {
    constructor(
        modelMetadata: IChatModelInformation,
        private readonly _apiKey: string,  // ✅ Custom API key
        @IAuthenticationService authService: IAuthenticationService,  // Injected but not used!
        // ... other services
    ) {
        super(/* ... */);
    }

    // ✅ Override to use YOUR auth
    override getExtraHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this._apiKey}`  // ✅ Your token, not GitHub
        };
    }

    // ✅ Override to use YOUR endpoint
    override get urlOrRequestMetadata(): string {
        return this._modelUrl;  // ✅ Your URL, not GitHub
    }
}
```

**Key Insight:** The endpoint receives `IAuthenticationService` but doesn't have to use it for API calls!

---

## Recommended Approach: Mock Auth + Custom Endpoint

### Architecture Overview

```
Your Patent Agent
        │
        ▼
┌─────────────────────────────────────┐
│  Mock IAuthenticationService        │  ← Returns fake CopilotToken
│  - Always "authenticated"           │     with all features enabled
│  - Returns permissive mock token    │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  Agent Code (unchanged)             │  ← Uses mock token to check
│  - Checks token.isChatEnabled()     │     features (all return true)
│  - Checks token.quotaExceeded()     │
│  - Gets available tools             │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  Custom Endpoint                    │  ← Uses YOUR API key
│  - getExtraHeaders() → your token   │     and YOUR endpoint
│  - urlOrRequestMetadata → your URL  │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  Your Patent Agent API              │  ← Your backend
│  http://localhost:8000/v1           │
└─────────────────────────────────────┘
```

### Benefits

✅ **Agent code works unchanged** - No modifications needed
✅ **Full tool access** - All tools available
✅ **Context injection** - Workspace, files, etc.
✅ **Chat UI integration** - Uses Copilot chat panel
✅ **ReAct loop** - Full agent orchestration
✅ **Your auth** - Your API key, your backend

---

## Implementation Guide

### Step 1: Create Mock Authentication Service

**File:** `src/extension/byok/node/flowleapAuthenticationService.ts`

```typescript
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { CopilotToken, ExtendedTokenInfo } from '../../../platform/authentication/common/copilotToken';
import { AuthenticationSession } from 'vscode';

export class FlowLeapAuthenticationService implements IAuthenticationService {
    readonly _serviceBrand: undefined;

    private _mockToken: CopilotToken | undefined;

    constructor() {
        // Create mock token on initialization
        this._mockToken = this.createMockToken();
    }

    // Return mock token - always "authenticated"
    async getCopilotToken(force?: boolean): Promise<CopilotToken | undefined> {
        return this._mockToken;
    }

    // Cached version
    getCopilotTokenCached(): CopilotToken | undefined {
        return this._mockToken;
    }

    get copilotToken(): Omit<CopilotToken, 'token'> | undefined {
        return this._mockToken;
    }

    get isSignedIn(): boolean {
        return true;  // Always signed in
    }

    get isMinimalMode(): boolean {
        return false;  // Full permissions
    }

    // Return fake GitHub session (not used by custom endpoint)
    async getAnyGitHubSession(options?: any): Promise<AuthenticationSession | undefined> {
        return {
            id: 'flowleap-session',
            accessToken: 'not-used-by-endpoint',
            account: { id: 'flowleap', label: 'FlowLeap User' },
            scopes: ['user:email', 'repo', 'workflow']  // Permissive
        };
    }

    // Same as above
    async getPermissiveGitHubSession(options?: any): Promise<AuthenticationSession | undefined> {
        return this.getAnyGitHubSession(options);
    }

    // No-op methods
    resetCopilotToken(httpError?: number): void {
        // No-op
    }

    get speculativeDecodingEndpointToken(): string | undefined {
        return undefined;
    }

    // Event stubs (not needed for basic functionality)
    get onDidAuthenticationChange() {
        return { dispose: () => {} } as any;
    }

    get onDidAccessTokenChange() {
        return { dispose: () => {} } as any;
    }

    // Create mock CopilotToken with all features enabled
    private createMockToken(): CopilotToken {
        const mockTokenInfo: ExtendedTokenInfo = {
            // Token string (not used by custom endpoint)
            token: 'flowleap:mock:token',

            // Expiration (24 hours)
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            refresh_in: 3600,

            // User identity
            username: 'flowleap-user',
            sku: 'flowleap_enterprise',
            copilot_plan: 'enterprise',

            // Organization (empty - not using GitHub)
            organization_list: [],
            enterprise_list: [],

            // ✅ ENABLE ALL FEATURES
            chat_enabled: true,                    // Enable chat
            copilotignore_enabled: false,          // Not using .copilotignore
            code_quote_enabled: false,             // No code citation
            public_suggestions: 'enabled',         // Allow suggestions
            telemetry: 'disabled',                 // No telemetry
            editor_preview_features: true,         // Enable preview features
            codex_agent_enabled: true,             // Enable agent

            // ✅ NO QUOTAS
            limited_user_quotas: undefined,        // Unlimited
            quota_snapshots: undefined,

            // Custom endpoints (not used)
            endpoints: {
                api: 'http://localhost:8000',
                proxy: 'http://localhost:8000',
                telemetry: undefined
            },

            // Not VSCode team member
            isVscodeTeamMember: false,
            individual: false,
        };

        return new CopilotToken(mockTokenInfo);
    }
}
```

### Step 2: Create Custom Endpoint

**File:** `src/extension/byok/node/flowleapChatEndpoint.ts`

```typescript
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatModelInformation } from '../../../platform/models/common/chatModels';
// ... other imports

export class FlowLeapChatEndpoint extends ChatEndpoint {
    constructor(
        modelMetadata: IChatModelInformation,
        private readonly flowleapApiKey: string,       // ✅ Your API key
        private readonly flowleapApiUrl: string,       // ✅ Your endpoint
        @IAuthenticationService authenticationService: IAuthenticationService,
        @IFetcherService fetcherService: IFetcherService,
        @ILogService logService: ILogService,
        @IInstantiationService instantiationService: IInstantiationService,
        // ... inject all required services
    ) {
        super(
            modelMetadata,
            authenticationService,  // Pass through (for agent code)
            fetcherService,
            logService,
            instantiationService,
            // ... other services
        );
    }

    // ✅ Override to use YOUR auth
    override getExtraHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.flowleapApiKey}`,  // ✅ Your token
            'X-FlowLeap-Client': 'vscode-extension',
            'X-FlowLeap-Version': '1.0.0'
        };
    }

    // ✅ Override to use YOUR endpoint
    override get urlOrRequestMetadata(): string {
        return this.flowleapApiUrl;  // ✅ Your URL
    }

    // ✅ Skip GitHub policy check
    override async acceptChatPolicy(): Promise<boolean> {
        return true;  // No policy to accept
    }
}
```

### Step 3: Register in Service Container

**File:** `src/extension/extension/vscode-node/services.ts`

```typescript
// Add FlowLeap mode check
const isFlowLeapMode = process.env.FLOWLEAP_MODE === 'true' ||
                       context.globalState.get<boolean>('flowleap.enabled', false);

// Register authentication service
if (isFlowLeapMode) {
    // ✅ Use FlowLeap auth (mock)
    builder.define(IAuthenticationService,
        new SyncDescriptor(FlowLeapAuthenticationService));
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

### Step 4: Register Custom Endpoint

**File:** `src/extension/prompt/vscode-node/endpointProviderImpl.ts` (or new contribution file)

```typescript
export class FlowLeapEndpointContribution extends Disposable implements IExtensionContribution {
    constructor(
        @ILogService private readonly logService: ILogService,
        @IInstantiationService private readonly instantiationService: IInstantiationService,
        @IEndpointProvider private readonly endpointProvider: IEndpointProvider,
        @IConfigurationService private readonly configService: IConfigurationService,
    ) {
        super();
        this.registerFlowLeapEndpoint();
    }

    private registerFlowLeapEndpoint(): void {
        const isEnabled = this.configService.getConfig('flowleap.enabled');
        if (!isEnabled) return;

        const apiKey = this.configService.getConfig('flowleap.apiKey');
        const apiUrl = this.configService.getConfig('flowleap.apiUrl') ||
                       'http://localhost:8000/v1/chat/completions';

        if (!apiKey) {
            this.logService.error('FlowLeap API key not configured');
            return;
        }

        // Create model metadata
        const modelMetadata: IChatModelInformation = {
            id: 'flowleap-patent-agent',
            name: 'FlowLeap Patent Agent',
            family: 'flowleap',
            maxTokens: 128000,
            // ... other metadata
        };

        // Create endpoint instance
        const flowleapEndpoint = this.instantiationService.createInstance(
            FlowLeapChatEndpoint,
            modelMetadata,
            apiKey,
            apiUrl
        );

        // Register with endpoint provider
        this.endpointProvider.registerEndpoint(flowleapEndpoint);

        this.logService.info('FlowLeap endpoint registered');
    }
}
```

### Step 5: Configuration

**File:** `.vscode/settings.json` or environment variables

```json
{
    "flowleap.enabled": true,
    "flowleap.apiKey": "your-api-key-here",
    "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions"
}
```

**Or environment variables:**

```bash
export FLOWLEAP_MODE=true
export FLOWLEAP_API_KEY="your-api-key"
export FLOWLEAP_API_URL="http://localhost:8000/v1/chat/completions"
```

---

## What Works vs. What Doesn't

### ✅ What WILL Work (With Mock Auth)

| Feature | Status | Why |
|---------|--------|-----|
| **Chat Interface** | ✅ Works | Mock token has `chat_enabled: true` |
| **Tool Calling** | ✅ Works | Agent code checks mock token features |
| **Context Injection** | ✅ Works | Workspace, files, terminal state |
| **ReAct Loop** | ✅ Works | Full agent orchestration |
| **Streaming** | ✅ Works | Endpoint handles streaming |
| **Multi-turn** | ✅ Works | Conversation history |
| **All Agent Tools** | ✅ Works | readFile, codebaseSearch, etc. |
| **Custom Tools** | ✅ Works | Your patent search, sandbox, etc. |

### ❌ What WON'T Work (GitHub-Specific)

| Feature | Status | Why |
|---------|--------|-----|
| **GitHub Repo Integration** | ❌ Won't work | Requires real GitHub API |
| **GitHub Search** | ❌ Won't work | Needs GitHub access |
| **Org Policies** | ❌ Won't work | GitHub-controlled |
| **Telemetry** | ❌ Won't work | GitHub endpoints |
| **CLI Agent Mode** | ❌ Won't work | Hardcoded GitHub.com host |

### ⚠️ What MIGHT Need Adjustment

| Feature | Status | Solution |
|---------|--------|----------|
| **Remote Agents** | ⚠️ Depends | Most require `editor_context: true` which needs repo scope - mock token provides this |
| **MCP Tools** | ⚠️ Depends | Check if they require GitHub - mock token has `mcp: true` |
| **Model Selection** | ⚠️ Depends | May need to filter model list based on your models |

---

## Alternative Approaches

### Option A: Mock Auth + Custom Endpoint (RECOMMENDED)

**Pros:**
- ✅ Full agent integration
- ✅ All tools work
- ✅ Minimal code changes
- ✅ Clean abstraction

**Cons:**
- ⚠️ Need to maintain mock token structure
- ⚠️ If CopilotToken structure changes, need to update

**Effort:** 10-20 hours

### Option B: Endpoint-Only Custom Auth

**Pros:**
- ✅ Simpler
- ✅ Only override endpoint methods

**Cons:**
- ❌ Agent features might not work
- ❌ May need to modify agent code
- ❌ Context checks might fail

**Effort:** 4-8 hours

### Option C: Fork and Gut GitHub Dependencies

**Pros:**
- ✅ Complete control
- ✅ Remove all GitHub code

**Cons:**
- ❌ Massive effort (weeks)
- ❌ Can't merge upstream changes
- ❌ Maintenance nightmare

**Effort:** 80-160 hours

---

## Backend Requirements

### Do You Need a GitHub-Like Backend?

**NO!** You only need:

#### 1. OpenAI-Compatible Chat Endpoint

```typescript
POST http://localhost:8000/v1/chat/completions

Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "model": "patent-agent",
  "messages": [
    { "role": "system", "content": "You are..." },
    { "role": "user", "content": "Search patents for..." }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "patent_search",
        "description": "Search patent databases",
        "parameters": { ... }
      }
    }
  ],
  "stream": true
}

Response (streaming):
data: {"choices": [{"delta": {"content": "..."}}]}
data: {"choices": [{"delta": {"tool_calls": [...]}}]}
data: [DONE]
```

#### 2. That's It!

You DON'T need:
- ❌ Token minting endpoint
- ❌ User info endpoint
- ❌ Organization management
- ❌ Quota tracking (handled by mock token)
- ❌ Telemetry endpoints

---

## Testing Strategy

### Step 1: Verify Mock Auth

```typescript
// Test mock auth service
const authService = new FlowLeapAuthenticationService();
const token = await authService.getCopilotToken();

console.assert(token.isChatEnabled() === true);
console.assert(token.isChatQuotaExceeded() === false);
console.assert(token.isMcpEnabled() === true);
console.assert(authService.isSignedIn === true);
```

### Step 2: Verify Endpoint

```typescript
// Test endpoint headers
const endpoint = new FlowLeapChatEndpoint(
    modelMetadata,
    'test-api-key',
    'http://localhost:8000/v1'
);

const headers = endpoint.getExtraHeaders();
console.assert(headers['Authorization'] === 'Bearer test-api-key');
```

### Step 3: Integration Test

```bash
# Start your patent agent backend
npm run start:backend

# Set FlowLeap mode
export FLOWLEAP_MODE=true
export FLOWLEAP_API_KEY=test-key

# Start VSCode extension
npm run watch
# Press F5 to launch Extension Development Host

# Test in Extension Host
1. Open Copilot Chat
2. Send message: "Search patents for AI agents"
3. Verify tool calls work
4. Check streaming response
```

---

## Migration Path

### Phase 1: Keep Existing FlowLeap Provider ✅ (CURRENT)

**Status:** Already working as Language Model provider

**Features:**
- Basic chat
- No tools
- No context

### Phase 2: Add Mock Auth 🔧 (NEXT)

**Status:** Ready to implement

**Effort:** 4-8 hours

**Files to create:**
- `flowleapAuthenticationService.ts`
- Configuration handling

**Result:**
- Agent thinks you're authenticated
- Feature flags enabled
- Still using FlowLeap provider

### Phase 3: Add Custom Endpoint 🔧

**Status:** After Phase 2

**Effort:** 4-8 hours

**Files to create:**
- `flowleapChatEndpoint.ts`
- Endpoint registration

**Result:**
- Full agent integration
- Tool calling works
- Context injection works

### Phase 4: Custom Tools Integration 🔧

**Status:** After Phase 3

**Effort:** 8-16 hours

**Files to create:**
- Patent search tool
- Sandbox execution tool
- Prior art analysis tool

**Result:**
- Patent-specific tools available
- Full AI patent agent functionality

---

## Key Takeaways

### 1. You CAN Replace Auth

✅ **YES** - The auth system is abstracted behind `IAuthenticationService`

### 2. You DON'T Need GitHub-Like Backend

✅ **NO** - Just need OpenAI-compatible chat endpoint with your API key

### 3. Best Strategy: Mock Token

✅ **Mock CopilotToken** - Return fake token with all features enabled

### 4. Minimal Code Changes

✅ **Agent code unchanged** - Only create new service implementations

### 5. Reasonable Effort

✅ **10-20 hours** - For full agent integration

---

## Next Steps

### Immediate Actions

1. **Create mock auth service** (4 hours)
   - Implement `FlowLeapAuthenticationService`
   - Create mock `CopilotToken`
   - Test token feature flags

2. **Create custom endpoint** (4 hours)
   - Implement `FlowLeapChatEndpoint`
   - Override `getExtraHeaders()`
   - Override `urlOrRequestMetadata`

3. **Register in DI container** (2 hours)
   - Modify `services.ts`
   - Add configuration support
   - Test service resolution

4. **Integration testing** (4-8 hours)
   - Test chat interface
   - Test tool calling
   - Test streaming
   - Test multi-turn conversations

### Long-Term

1. **Custom tools** (8-16 hours)
   - Patent search tool
   - Sandbox execution tool
   - Prior art analysis tool

2. **Polish UX** (4-8 hours)
   - Custom welcome screen
   - Patent-specific UI elements
   - Error handling

3. **Documentation** (4 hours)
   - Setup guide
   - API documentation
   - Troubleshooting

---

## Conclusion

**You CAN replace the GitHub authentication with minimal changes.**

**Recommended approach:**
- ✅ Mock `IAuthenticationService`
- ✅ Return fake `CopilotToken` with all features enabled
- ✅ Custom endpoint with your API key
- ✅ Agent code works unchanged

**Effort:** 10-20 hours for full integration

**Risk:** Low - clean abstraction points exist

**Backend:** Just need OpenAI-compatible endpoint, not GitHub-like infrastructure

---

**Generated:** 2025-11-20
**For:** FlowLeap Patent AI Agent Integration
