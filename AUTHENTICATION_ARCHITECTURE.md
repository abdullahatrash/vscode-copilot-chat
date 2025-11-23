# Authentication Architecture Analysis

> Complete analysis of VSCode Copilot's authentication system and how it affects agent functionality

---

## Table of Contents

- [Overview](#overview)
- [Auth Architecture](#auth-architecture)
- [Auth Providers](#auth-providers)
- [Auth Flow](#auth-flow)
- [Agent Impact](#agent-impact---how-auth-affects-functionality)
- [Auth States](#auth-states)
- [Token Management](#token-management)
- [Entitlements & Feature Gating](#entitlements--feature-gating)
- [Error Handling](#error-handling)
- [Key Files Reference](#key-files-reference)
- [Application to Your Patent Agent](#application-to-your-patent-agent)

---

## Overview

The VSCode Copilot extension uses a **layered authentication system** that gates all agent functionality. Without proper authentication, the agent is completely disabled.

### Key Characteristics

- **Mandatory Authentication** - No agent features work without valid auth
- **GitHub-Based** - Primary authentication through GitHub OAuth
- **Token Exchange** - GitHub token → Copilot token → Feature access
- **Scope-Based Gating** - Different scopes enable different features
- **SKU-Based Limits** - Free/Individual/Business/Enterprise tiers
- **Dynamic Feature Flags** - Server-controlled feature enablement

---

## Auth Architecture

### Core Service: IAuthenticationService

**File:** [src/platform/authentication/common/authentication.ts](src/platform/authentication/common/authentication.ts)

```typescript
interface IAuthenticationService {
    // Token Access
    getCopilotToken(forceRefresh?: boolean): Promise<CopilotToken | undefined>;
    getCopilotTokenCached(): CopilotToken | undefined;

    // Session Management
    getGitHubSession(options?: GetSessionOptions): Promise<AuthenticationSession | undefined>;
    getPermissiveGitHubSession(): Promise<AuthenticationSession | undefined>;

    // State
    readonly isSignedIn: boolean;
    readonly isMinimalMode: boolean;

    // Events
    onDidChangeAuthState: Event<AuthState>;
    onDidCopilotTokenRefresh: Event<void>;
}
```

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                   VSCode Auth API                           │
│              (authentication.getSession)                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│            AuthenticationService                            │
│  - Manages GitHub sessions (any/permissive)                │
│  - Handles session changes and domain changes              │
│  - TaskSingler prevents duplicate auth flows               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│            CopilotTokenManager                              │
│  - Exchanges GitHub token → Copilot token                  │
│  - Makes requests to GitHub Copilot API                    │
│  - Handles token minting and refresh                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              CopilotToken                                   │
│  - Parses token fields (tid, dom, exp, ccr, mcp)          │
│  - Exposes feature flags and quota info                    │
│  - Validates SKU and organization membership               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Feature Activation                                │
│  - ConversationFeature checks copilotToken                 │
│  - LanguageModelAccess gates model usage                   │
│  - Context keys control UI visibility                      │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**AuthenticationService** ([src/platform/authentication/vscode-node/authenticationService.ts](src/platform/authentication/vscode-node/authenticationService.ts))
- Concrete implementation for VSCode environment
- Integrates with VSCode's `authentication.getSession()` API
- Listens to session changes and domain changes
- Uses TaskSingler to prevent duplicate authentication flows

**CopilotTokenManager** ([src/platform/authentication/vscode-node/copilotTokenManager.ts](src/platform/authentication/vscode-node/copilotTokenManager.ts))
- Exchanges GitHub OAuth token for Copilot-specific token
- Makes requests to GitHub Copilot API endpoints
- Handles token minting, refresh, and error recovery

**CopilotToken** ([src/platform/authentication/common/copilotToken.ts](src/platform/authentication/common/copilotToken.ts))
- Parses and validates Copilot token structure
- Extracts feature flags and quota information
- Provides convenience methods for feature checks

---

## Auth Providers

### Supported Providers

The extension supports multiple authentication providers configured via `github.copilot.advanced.authProvider`:

| Provider | Description | Use Case |
|----------|-------------|----------|
| `github` | Standard GitHub | Default for public GitHub |
| `github-enterprise` | GitHub Enterprise Server | Self-hosted GitHub |
| `microsoft` | Azure DevOps | ADO integration |

### Scope Hierarchy

Authentication scopes determine what features are available:

#### 1. **Minimal Scope** (`user:email`)

```typescript
GITHUB_SCOPE_USER_EMAIL = ['user:email']
```

**Enables:**
- Basic authentication
- User identification
- Core chat functionality

**Disables:**
- Repository context
- Private repo access
- GitHub integration features

#### 2. **Legacy Scope** (`read:user`)

```typescript
GITHUB_SCOPE_READ_USER = ['read:user']
```

**Purpose:**
- Backward compatibility with Completions extension
- Similar to minimal scope

#### 3. **Permissive Scope** (Full Access)

```typescript
GITHUB_SCOPE_ALIGNED = ['read:user', 'user:email', 'repo', 'workflow']
```

**Enables:**
- Full repository access
- Private repository content
- GitHub integration
- Context-aware features
- Remote agent skills requiring repository data

**Alignment:**
- Matches scopes used by GitHub PR and Repositories extensions
- Enables seamless integration across extensions

---

## Auth Flow

### Token Flow Architecture

```
GitHub OAuth Token
        │
        ▼
┌─────────────────────┐
│ Copilot Token API   │  POST /copilot_internal/v2/token
│                     │  Headers: Authorization: token <github_token>
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Copilot Token      │  {
│                     │    token: "fields:mac",
│                     │    expires_at: 1234567890,
│                     │    chat_enabled: true,
│                     │    sku: "copilot_enterprise_seat",
│                     │    ...
│                     │  }
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Feature Access     │
│  - Chat enabled?    │
│  - Quota available? │
│  - Org policies?    │
│  - Model access?    │
└─────────────────────┘
```

### Authentication Process

#### Step 1: User Signs In

```typescript
// Triggered by user action or automatic sign-in
const githubSession = await authentication.getSession('github', scopes, {
    createIfNone: true
});

// Returns:
{
    id: string,
    accessToken: string,
    account: { id: string, label: string },
    scopes: string[]
}
```

#### Step 2: Token Minting

**Endpoint:** `POST /copilot_internal/v2/token`

```typescript
async function authFromGitHubToken(
    githubToken: string,
    githubSession: AuthenticationSession
): Promise<ExtendedTokenInfo> {
    // 1. Exchange GitHub token for Copilot token
    const response = await fetch(
        'https://api.github.com/copilot_internal/v2/token',
        {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Editor-Version': 'vscode/...',
                'Editor-Plugin-Version': 'copilot-chat/...',
                'User-Agent': '...'
            }
        }
    );

    const tokenData = await response.json();

    // 2. Fetch user info
    const userInfo = await fetchUserInfo(githubToken);

    // 3. Return extended token
    return {
        ...tokenData,
        token_type: 'Bearer',
        github_token: githubToken,
        github_login: userInfo.username
    };
}
```

#### Step 3: Token Storage

```typescript
// ICopilotTokenStore - Simple in-memory store
class CopilotTokenStore implements ICopilotTokenStore {
    private token: CopilotToken | undefined;

    async getCopilotToken(): Promise<CopilotToken | undefined> {
        return this.token;
    }

    async setCopilotToken(token: CopilotToken | undefined): Promise<void> {
        this.token = token;
        this._onDidChangeCopilotToken.fire(token);
    }
}
```

**Security Notes:**
- Tokens stored in memory only (not persisted)
- Regenerated from GitHub token on restart
- No filesystem or keychain storage
- Only token values logged in debug mode

#### Step 4: Token Refresh

```typescript
async getCopilotToken(forceRefresh?: boolean): Promise<CopilotToken | undefined> {
    const cached = this.getCopilotTokenCached();

    // Check if refresh needed
    if (!forceRefresh && cached && !this.shouldRefreshToken(cached)) {
        return cached;
    }

    // Refresh token
    const githubSession = await this.getGitHubSession();
    const newToken = await this.mintCopilotToken(githubSession.accessToken);

    await this.tokenStore.setCopilotToken(newToken);
    this._onDidCopilotTokenRefresh.fire();

    return newToken;
}

private shouldRefreshToken(token: CopilotToken): boolean {
    const now = Date.now();
    const expiresAt = token.expires_at * 1000;
    const refreshIn = token.refresh_in * 1000;

    // Refresh 5 minutes before expiration
    return now >= (expiresAt - refreshIn - 5 * 60 * 1000);
}
```

### Alternative Auth Flow: Anonymous/Free Tier

**For Free Users Without GitHub Account:**

```typescript
// Endpoint: POST /copilot_internal/v2/noauth_token
const response = await fetch(
    'https://api.github.com/copilot_internal/v2/noauth_token',
    {
        method: 'POST',
        body: JSON.stringify({
            device_id: devDeviceId  // Anonymous device identifier
        })
    }
);

// Returns token with:
// - sku: "no_auth_limited_copilot"
// - limited_user_quotas: { chat: N, completions: M }
// - chat_enabled: true (if quota not exceeded)
```

---

## Agent Impact - How Auth Affects Functionality

### 1. When NOT Authenticated (No Token)

**Complete Feature Lockout:**

❌ **Disabled:**
- All chat functionality
- All agent features
- Language model access
- Tool invocations
- Conversation history
- Context injection

**UI State:**
- Welcome screen shown
- Sign-in prompt displayed
- Context key: `github.copilot-chat.activated = false`
- Feature not activated in activation event

**Code Reference:**

```typescript
// src/extension/conversation/vscode-node/conversationFeature.ts
async activate() {
    const copilotToken = await this.authenticationService.getCopilotToken();

    if (!copilotToken || !copilotToken.isChatEnabled()) {
        // Don't activate chat features
        return;
    }

    // Proceed with activation...
}
```

### 2. When Authenticated - Minimal Scope (`user:email`)

**Basic Chat Works:**

✅ **Enabled:**
- Basic conversation
- Code explanations from open files
- General programming questions
- Public documentation search
- Tool calls that don't require repo access

❌ **Disabled:**
- Repository context injection
- Private repository access
- GitHub integration features
- Remote agents with `editor_context: true`
- Workspace-wide code search in private repos

**User Experience:**
- Badge shown: "Limited mode - grant additional permissions for full features"
- Periodic prompts to upgrade scope (unless in minimal mode setting)
- Graceful degradation of context-aware features

**Code Reference:**

```typescript
// Check for permissive session
const permissiveSession = await this.authenticationService.getPermissiveGitHubSession();

if (!permissiveSession) {
    // Show upgrade prompt
    const shouldPrompt = await this.authUpgradeService.shouldRequestPermissiveSessionUpgrade();

    if (shouldPrompt) {
        this.showUpgradePrompt();
    }
}
```

### 3. When Authenticated - Permissive Scope (Full Access)

**Full Feature Set:**

✅ **Enabled:**
- All chat features
- Repository context injection
- Private repository access
- GitHub integration
- Remote agent skills
- Workspace-wide operations
- Multi-repository analysis
- GitHub search integration

**Code Reference:**

```typescript
// src/extension/agents/remote/vscode-node/remoteAgentContribution.ts
if (agent.editor_context && !permissiveSession) {
    // Skip agents that require editor context without permission
    continue;
}

// Enable remote agent
this.registerRemoteAgent(agent);
```

### 4. Token-Based Feature Gating

**Feature Flags from Token:**

```typescript
class CopilotToken {
    // Core features
    isChatEnabled(): boolean {
        return this.chat_enabled ?? false;
    }

    isChatQuotaExceeded(): boolean {
        return this.limited_user_quotas?.chat === 0;
    }

    // Advanced features
    isCopilotIgnoreEnabled(): boolean {
        return this.copilotignore_enabled ?? false;
    }

    isMcpEnabled(): boolean {
        // Parsed from token fields: "mcp"
        return this.mcp ?? false;
    }

    isEditorPreviewFeaturesEnabled(): boolean {
        return this.editor_preview_features ?? true;
    }

    // Organization checks
    isInternal(): boolean {
        return this.isMicrosoftInternal() || this.isGitHubInternal();
    }

    isMicrosoftInternal(): boolean {
        return this.organization_list?.includes('Microsoft');
    }
}
```

**Usage in Code:**

```typescript
// Tool availability
if (!copilotToken.isMcpEnabled()) {
    // Disable MCP (Model Context Protocol) tools
    mcpTools.forEach(tool => tool.enabled = false);
}

// Feature visibility
if (!copilotToken.isEditorPreviewFeaturesEnabled()) {
    // Hide preview features from UI
    commands.executeCommand('setContext', 'github.copilot.previewFeaturesDisabled', true);
}

// Quota enforcement
if (copilotToken.isChatQuotaExceeded()) {
    // Block chat with quota exceeded message
    throw new Error('Monthly chat quota exceeded. Upgrade to continue.');
}
```

### 5. Tool Access Control

**Dynamic Tool Filtering:**

```typescript
// src/extension/intents/node/agentIntent.ts
function getAgentTools(
    endpoint: IChatEndpoint,
    copilotToken: CopilotToken,
    permissiveSession: AuthenticationSession | undefined
): LanguageModelTool[] {
    const allTools = ToolRegistry.getAllTools();

    return allTools.filter(tool => {
        // 1. Check if tool requires repo access
        if (tool.requiresRepoAccess && !permissiveSession) {
            return false;
        }

        // 2. Check if tool requires feature flag
        if (tool.requiresMcp && !copilotToken.isMcpEnabled()) {
            return false;
        }

        // 3. Check if tool is model-compatible
        if (!tool.supportsModel(endpoint.family)) {
            return false;
        }

        return true;
    });
}
```

**Examples:**

| Tool | Auth Requirement | Why |
|------|------------------|-----|
| `readFile` | Minimal scope | Only reads open files |
| `codebaseSearch` | Permissive scope | Needs repo access |
| `scmChanges` | Permissive scope | Reads git state |
| `manageTodoList` | Minimal scope | In-memory state only |
| `githubSearch` | Permissive scope + Feature flag | Requires GitHub integration |

### 6. Language Model Access

**Model Provider Gating:**

```typescript
// src/extension/conversation/vscode-node/languageModelAccess.ts
async getLanguageModel(modelId: string): Promise<LanguageModel> {
    const copilotToken = await this.authenticationService.getCopilotToken();

    if (!copilotToken) {
        throw new Error('Authentication required to access language models');
    }

    if (!copilotToken.isChatEnabled()) {
        throw new ChatDisabledError('Chat is not enabled for your account');
    }

    if (copilotToken.isChatQuotaExceeded()) {
        throw new QuotaExceededError('Monthly chat quota exceeded');
    }

    // Return language model
    return vscode.lm.selectChatModels({ id: modelId })[0];
}
```

---

## Auth States

### State Machine

```
┌─────────────────┐
│ Unauthenticated │
└────────┬────────┘
         │ Sign In
         ▼
┌─────────────────────────┐
│ Authenticated (Minimal) │ ◄───┐
│   user:email scope      │     │ Decline
└────────┬────────────────┘     │
         │ Grant Permissions    │
         ▼                      │
┌─────────────────────────────┐│
│ Authenticated (Permissive)  ││
│   repo, workflow scopes     │┘
└────────┬────────────────────┘
         │
         ├─► Token Expires ──► Refreshing ──► Authenticated
         │
         ├─► Subscription Expires ──► Subscription Expired
         │
         └─► Sign Out ──► Unauthenticated
```

### Context Keys

**File:** [src/extension/contextKeys/vscode-node/contextKeys.contribution.ts](src/extension/contextKeys/vscode-node/contextKeys.contribution.ts)

The system maintains context keys that control UI visibility and feature availability:

```typescript
// Core state
'github.copilot-chat.activated'                    // Has valid Copilot token
'github.copilot.offline'                           // Network connectivity issues

// Error states
'github.copilot.interactiveSession.individual.disabled'  // Not signed up
'github.copilot.interactiveSession.individual.expired'   // Subscription expired
'github.copilot.interactiveSession.enterprise.disabled'  // EMU issues
'github.copilot.interactiveSession.chatDisabled'         // Chat not enabled
'github.copilot.interactiveSession.contactSupport'       // Support needed

// Limitations
'github.copilot.chat.quotaExceeded'                // Free tier limit reached
'github.copilot.auth.missingPermissiveSession'     // Needs repo scope
'github.copilot.previewFeaturesDisabled'           // Org policy restriction

// Permissions
'github.copilot.auth.isMinimalMode'                // Explicitly minimal
```

**Usage in `package.json`:**

```json
{
    "command": "github.copilot.chat.open",
    "when": "github.copilot-chat.activated && !github.copilot.offline"
},
{
    "command": "github.copilot.upgradeScope",
    "when": "github.copilot.auth.missingPermissiveSession"
}
```

---

## Token Management

### Token Structure

**CopilotToken Format:**

```typescript
interface CopilotToken {
    // Core fields
    token: string;                      // Format: "fields:mac"
    expires_at: number;                 // Unix timestamp
    refresh_in: number;                 // Seconds until refresh recommended

    // User identity
    sku: string;                        // SKU identifier
    username: string;
    organization_list: string[];
    enterprise_list: number[];

    // Feature flags
    chat_enabled: boolean;
    copilotignore_enabled: boolean;
    code_quote_enabled: boolean;
    public_suggestions: string;
    telemetry: string;

    // Quota (free tier)
    limited_user_quotas?: {
        chat: number;                   // Requests remaining
        completions: number;
    };

    // Quota (premium)
    quota_snapshots?: {
        chat?: QuotaSnapshot;
        completions?: QuotaSnapshot;
    };

    // API endpoints
    endpoints: {
        api: string;
        proxy: string;
        telemetry?: string;
    };

    // Plan info
    copilot_plan?: string;              // 'free', 'individual', 'business', 'enterprise'

    // Additional flags (parsed from token)
    tracking_id?: string;               // tid
    domain?: string;                    // dom
    expires?: number;                   // exp
    code_citation_required?: boolean;   // ccr
    mcp?: boolean;                      // mcp
    editor_preview_features?: boolean;
    codex_agent_enabled?: boolean;
}
```

### Token Parsing

Copilot tokens embed metadata in the token string itself:

**Format:** `field1:value1;field2:value2:...:mac`

**Parsed Fields:**
- `tid` → `tracking_id`
- `dom` → `domain`
- `exp` → `expires`
- `ccr` → `code_citation_required`
- `mcp` → `mcp` (Model Context Protocol)
- `fcv1` → Feature flags bitmask

**Code:**

```typescript
private parseTokenMetadata(tokenString: string): TokenMetadata {
    const parts = tokenString.split(':');
    const fields: Record<string, string> = {};

    // Parse key:value pairs before MAC
    for (let i = 0; i < parts.length - 1; i += 2) {
        if (i + 1 < parts.length) {
            fields[parts[i]] = parts[i + 1];
        }
    }

    return {
        tracking_id: fields['tid'],
        domain: fields['dom'],
        expires: parseInt(fields['exp']),
        code_citation_required: fields['ccr'] === '1',
        mcp: fields['mcp'] === '1',
        // ... more fields
    };
}
```

### Token Lifecycle

#### 1. Initial Acquisition

```typescript
// User signs in
const githubSession = await authentication.getSession('github', scopes);

// Mint Copilot token
const copilotToken = await copilotTokenManager.authFromGitHubToken(
    githubSession.accessToken,
    githubSession
);

// Store in memory
await tokenStore.setCopilotToken(copilotToken);
```

#### 2. Automatic Refresh

```typescript
// Triggered by:
// - Token expiration (5 min before expires_at)
// - Force refresh request
// - Window focus (if token expired)

async refreshToken(): Promise<void> {
    const githubSession = await this.getGitHubSession();

    if (!githubSession) {
        await this.tokenStore.setCopilotToken(undefined);
        return;
    }

    const newToken = await this.copilotTokenManager.authFromGitHubToken(
        githubSession.accessToken,
        githubSession
    );

    await this.tokenStore.setCopilotToken(newToken);
    this._onDidCopilotTokenRefresh.fire();
}
```

#### 3. Token Reset

```typescript
// Triggered by:
// - HTTP 401/403 from API
// - Token parse failure
// - User sign-out
// - Session change detected

async resetCopilotToken(httpError?: number): Promise<void> {
    await this.tokenStore.setCopilotToken(undefined);

    if (httpError === 401) {
        this.notificationService.showMessage(
            'Your authentication expired. Please sign in again.',
            NotificationType.Error
        );
    }
}
```

### Token Validation

**Client-Side:**
```typescript
validate(): boolean {
    // Check expiration
    if (Date.now() >= this.expires_at * 1000) {
        return false;
    }

    // Check required fields
    if (!this.token || !this.username) {
        return false;
    }

    return true;
}
```

**Server-Side:**
- Token signature verified via MAC
- Token revocation checked
- Organization membership validated
- Quota limits enforced

---

## Entitlements & Feature Gating

### SKU Types

| SKU | Name | Features |
|-----|------|----------|
| `free_limited_copilot` | Free Tier | Limited quotas |
| `no_auth_limited_copilot` | Anonymous | Very limited |
| `copilot_individual` | Individual/Pro | Unlimited |
| `copilot_business` | Business | + Org policies |
| `copilot_enterprise_seat` | Enterprise | + Enterprise features |

### Free Tier Limitations

```typescript
interface LimitedUserQuotas {
    chat: number;           // Requests per month (e.g., 50)
    completions: number;    // Completions per month (e.g., 2000)
}

// Quota enforcement
if (copilotToken.isFreeUser() && copilotToken.isChatQuotaExceeded()) {
    throw new QuotaExceededError(
        'You have reached your monthly chat limit. ' +
        'Upgrade to GitHub Copilot Individual or Business for unlimited access.'
    );
}
```

**Quota Reset:**
- Monthly reset (based on subscription start date)
- Tracked server-side
- Enforced on API calls

### Organization Policies

**Enterprise/Business Features:**

```typescript
// Organization-wide settings
interface OrganizationPolicies {
    // Code training
    public_suggestions: 'allow' | 'block' | 'allow_only_public';

    // Telemetry
    telemetry: 'enabled' | 'disabled';

    // Features
    editor_preview_features: boolean;      // Can disable beta features
    copilotignore_enabled: boolean;        // .copilotignore support
    code_quote_enabled: boolean;           // Code citation tracking

    // Indexing
    blackbird_clientside_indexing: boolean; // Local codebase indexing

    // Agent
    codex_agent_enabled: boolean;          // Advanced agent features
}
```

**Policy Enforcement:**

```typescript
// Check if preview features allowed
if (!copilotToken.isEditorPreviewFeaturesEnabled()) {
    // Hide experimental features from UI
    commands.executeCommand('setContext',
        'github.copilot.previewFeaturesDisabled', true);
}

// Check if user can use certain models
if (copilotToken.organization_list?.includes('restricted-org')) {
    // Filter model list based on org policy
    availableModels = models.filter(m => m.approved);
}
```

### Internal User Features

**Special Access:**

```typescript
// Microsoft and GitHub employees get early access
if (copilotToken.isInternal()) {
    // Enable experimental features
    // Access to preview models
    // Advanced telemetry/debugging tools
}

// VS Code team members
if (copilotToken.isVscodeTeamMember()) {
    // Full diagnostic logging
    // Test environment access
}
```

---

## Error Handling

### Error Hierarchy

#### 1. NotSignedUpError

**Cause:** User doesn't have Copilot subscription

**Detection:**
```typescript
// API returns 404 or specific error codes
{
    "message": "not_signed_up",
    // or
    "message": "no_copilot_access"
}
```

**Handling:**
```typescript
const action = await notificationService.showMessage(
    'GitHub Copilot is not available. Sign up for Copilot to continue.',
    NotificationType.Error,
    [{ title: 'Sign Up', isCloseAffordance: false }]
);

if (action?.title === 'Sign Up') {
    env.openExternal('https://github.com/github-copilot/signup');
}
```

**Context Key:** `github.copilot.interactiveSession.individual.disabled = true`

#### 2. SubscriptionExpiredError

**Cause:** Subscription lapsed

**Detection:**
```typescript
{
    "message": "subscription_ended"
}
```

**Handling:**
```typescript
notificationService.showMessage(
    'Your GitHub Copilot subscription has expired. Renew your subscription to continue.',
    NotificationType.Error,
    [{ title: 'Renew Subscription', isCloseAffordance: false }]
);
```

**Context Key:** `github.copilot.interactiveSession.individual.expired = true`

#### 3. ChatDisabledError

**Cause:** Token received but `chat_enabled: false`

**Reasons:**
- Subscription tier doesn't include chat
- Organization policy disabled chat
- Account flagged

**Handling:**
```typescript
notificationService.showMessage(
    'Chat is not enabled for your account. Contact your administrator.',
    NotificationType.Error
);
```

**Context Key:** `github.copilot.interactiveSession.chatDisabled = true`

#### 4. EnterpriseManagedError

**Cause:** Enterprise Managed User (EMU) account needs different auth flow

**Detection:**
```typescript
{
    "message": "enterprise_managed_user_account"
}
```

**Handling:**
```typescript
notificationService.showMessage(
    'You are using an Enterprise Managed User account. ' +
    'Please authenticate using your organization\'s identity provider.',
    NotificationType.Error,
    [{ title: 'Learn More', isCloseAffordance: false }]
);
```

**Context Key:** `github.copilot.interactiveSession.enterprise.disabled = true`

#### 5. ContactSupportError

**Causes:**
- Server error
- Feature flag blocked
- Spammy user detection
- Configuration issues

**Detection:**
```typescript
{
    "message": "server_error" | "feature_flag_blocked" |
               "spammy_user" | "snippy_not_configured"
}
```

**Handling:**
```typescript
notificationService.showMessage(
    'An error occurred. Please contact GitHub Support.',
    NotificationType.Error,
    [{ title: 'Contact Support', isCloseAffordance: false }]
);
```

**Context Key:** `github.copilot.interactiveSession.contactSupport = true`

### Network Error Handling

#### Offline Detection

```typescript
try {
    const token = await this.copilotTokenManager.mintToken(githubToken);
} catch (error) {
    if (this.fetcherService.isFetcherError(error)) {
        // Network error - go offline
        await commands.executeCommand('setContext',
            'github.copilot.offline', true);

        // Schedule retry in 60 seconds
        setTimeout(() => this.retryAuthentication(), 60000);

        // Retry when window gains focus
        this.windowFocusListener = window.onDidChangeWindowState(state => {
            if (state.focused) {
                this.retryAuthentication();
            }
        });
    }
}
```

#### Rate Limiting

```typescript
// GitHub API rate limit
if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining === '0') {
        const resetDate = new Date(parseInt(reset) * 1000);

        notificationService.showMessage(
            `GitHub API rate limit exceeded. Try again after ${resetDate.toLocaleTimeString()}.`,
            NotificationType.Warning
        );

        return { error: 'RateLimited', resetAt: resetDate };
    }
}
```

#### HTTP 401 Handling

```typescript
// Invalid GitHub token
if (response.status === 401) {
    // Show message once per session
    if (!this.shownInvalidTokenMessage) {
        notificationService.showMessage(
            'Your GitHub token is invalid. Please sign out and sign in again.',
            NotificationType.Error,
            [{ title: 'Sign Out', isCloseAffordance: false }]
        );
        this.shownInvalidTokenMessage = true;
    }

    // Mark token as invalid
    await this.resetCopilotToken(401);
}
```

### Auth Upgrade Flow

**When to Prompt:**

```typescript
// src/platform/authentication/common/authenticationUpgradeService.ts
shouldRequestPermissiveSessionUpgrade(): boolean {
    // Don't annoy: Only ask once per session
    if (this.hasAskedThisSession) {
        return false;
    }

    // Check: Not in minimal mode (user explicitly declined)
    if (this.authenticationService.isMinimalMode) {
        return false;
    }

    // Check: Don't have permissive session
    if (this.authenticationService.getPermissiveGitHubSession()) {
        return false;
    }

    // Check: User is signed in
    if (!this.authenticationService.isSignedIn) {
        return false;
    }

    // Check: Can't access all open repositories
    const openRepos = this.getOpenRepositories();
    const accessibleRepos = this.getAccessibleRepositories();

    if (openRepos.every(repo => accessibleRepos.includes(repo))) {
        return false;
    }

    return true;
}
```

**Upgrade Prompt:**

```typescript
const action = await notificationService.showMessage(
    'Grant additional permissions to enable repository context and advanced features.',
    NotificationType.Info,
    [
        { title: 'Grant', isCloseAffordance: false },
        { title: 'Not Now', isCloseAffordance: false },
        { title: 'Never Ask Again', isCloseAffordance: true }
    ]
);

if (action?.title === 'Grant') {
    // Trigger OAuth flow with additional scopes
    await authentication.getSession('github', GITHUB_SCOPE_ALIGNED, {
        createIfNone: true,
        forceNewSession: false
    });

    this.authUpgradeService.onDidGrantAuthUpgrade.fire();
}

if (action?.title === 'Never Ask Again') {
    // Set minimal mode permanently
    await configuration.update(
        'github.copilot.advanced.authPermissions',
        'minimal',
        ConfigurationTarget.Global
    );
}
```

---

## Key Files Reference

### Core Authentication

- **[src/platform/authentication/common/authentication.ts](src/platform/authentication/common/authentication.ts)**
  - `IAuthenticationService` interface
  - Core auth types and constants

- **[src/platform/authentication/vscode-node/authenticationService.ts](src/platform/authentication/vscode-node/authenticationService.ts)**
  - `AuthenticationService` implementation
  - Session management
  - Event handling

- **[src/platform/authentication/vscode-node/copilotTokenManager.ts](src/platform/authentication/vscode-node/copilotTokenManager.ts)**
  - Token minting and refresh
  - API communication
  - Error handling

- **[src/platform/authentication/common/copilotToken.ts](src/platform/authentication/common/copilotToken.ts)**
  - `CopilotToken` class
  - Token parsing and validation
  - Feature flag accessors

- **[src/platform/authentication/common/copilotTokenStore.ts](src/platform/authentication/common/copilotTokenStore.ts)**
  - `ICopilotTokenStore` interface
  - In-memory token storage

### Feature Activation

- **[src/extension/conversation/vscode-node/conversationFeature.ts](src/extension/conversation/vscode-node/conversationFeature.ts)**
  - Chat feature activation
  - Auth state checking

- **[src/extension/conversation/vscode-node/languageModelAccess.ts](src/extension/conversation/vscode-node/languageModelAccess.ts)**
  - Language model provider
  - Model access gating

### Context Management

- **[src/extension/contextKeys/vscode-node/contextKeys.contribution.ts](src/extension/contextKeys/vscode-node/contextKeys.contribution.ts)**
  - Context key management
  - Auth state to UI mapping

### Auth Upgrade

- **[src/platform/authentication/common/authenticationUpgradeService.ts](src/platform/authentication/common/authenticationUpgradeService.ts)**
  - Scope upgrade prompts
  - Minimal mode handling

---

## Application to Your Patent Agent

### Key Takeaways for Building a Patent AI Agent

#### 1. **Implement Tiered Authentication**

```typescript
// Patent agent auth tiers
enum PatentAgentTier {
    Free,        // Limited searches per month
    Professional, // Unlimited searches, basic tools
    Enterprise   // All features + custom integrations
}

interface PatentAuthToken {
    token: string;
    expires_at: number;
    tier: PatentAgentTier;
    quotas: {
        patent_searches: number;
        prior_art_analyses: number;
        claim_generations: number;
    };
    features: {
        sandbox_execution: boolean;
        multi_jurisdiction: boolean;
        api_access: boolean;
    };
}
```

#### 2. **Feature Gating Pattern**

```typescript
class PatentAgentService {
    async searchPatents(query: string): Promise<SearchResults> {
        const token = await this.authService.getToken();

        if (!token) {
            throw new AuthRequiredError('Sign in to search patents');
        }

        if (token.isQuotaExceeded('patent_searches')) {
            throw new QuotaExceededError(
                'Monthly search limit reached. Upgrade for unlimited access.'
            );
        }

        // Perform search
        return this.patentSearchService.search(query, token);
    }

    async executeSandboxCode(code: string): Promise<ExecutionResult> {
        const token = await this.authService.getToken();

        if (!token.features.sandbox_execution) {
            throw new FeatureNotAvailableError(
                'Sandbox execution requires Professional or Enterprise tier'
            );
        }

        // Execute code
        return this.sandboxService.execute(code, token);
    }
}
```

#### 3. **Token Refresh Strategy**

```typescript
class PatentTokenManager {
    private token: PatentAuthToken | undefined;
    private refreshTimer: NodeJS.Timeout | undefined;

    async getToken(forceRefresh = false): Promise<PatentAuthToken> {
        // Return cached if valid
        if (!forceRefresh && this.token && !this.isExpiringSoon(this.token)) {
            return this.token;
        }

        // Refresh token
        const newToken = await this.refreshToken();
        this.token = newToken;

        // Schedule next refresh
        this.scheduleRefresh(newToken);

        return newToken;
    }

    private isExpiringSoon(token: PatentAuthToken): boolean {
        const fiveMinutes = 5 * 60 * 1000;
        return Date.now() >= (token.expires_at * 1000 - fiveMinutes);
    }

    private scheduleRefresh(token: PatentAuthToken): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const refreshIn = (token.expires_at * 1000) - Date.now() - (5 * 60 * 1000);
        this.refreshTimer = setTimeout(() => this.getToken(true), refreshIn);
    }
}
```

#### 4. **Graceful Degradation**

```typescript
class PatentAgentUI {
    async analyzePatent(patentId: string): Promise<void> {
        const token = await this.authService.getToken();

        if (!token) {
            // Show sign-in prompt
            this.showAuthRequired();
            return;
        }

        try {
            // Try full analysis with all features
            if (token.tier >= PatentAgentTier.Professional) {
                return await this.fullAnalysis(patentId, token);
            }

            // Fall back to basic analysis
            return await this.basicAnalysis(patentId, token);

        } catch (error) {
            if (error instanceof QuotaExceededError) {
                // Show upgrade prompt
                this.showUpgradePrompt();
            } else if (error instanceof AuthExpiredError) {
                // Refresh and retry
                await this.authService.refreshToken();
                return this.analyzePatent(patentId);
            }
            throw error;
        }
    }
}
```

#### 5. **Context Keys for UI**

```typescript
// Similar to VSCode's context keys
enum PatentAgentContext {
    Authenticated = 'patentAgent.authenticated',
    TierFree = 'patentAgent.tier.free',
    TierProfessional = 'patentAgent.tier.professional',
    TierEnterprise = 'patentAgent.tier.enterprise',
    QuotaExceeded = 'patentAgent.quotaExceeded',
    SandboxEnabled = 'patentAgent.features.sandbox',
}

// Use in UI framework
<button
    disabled={!context[PatentAgentContext.SandboxEnabled]}
    onClick={executeSandbox}
>
    Execute Code
</button>
```

### Security Best Practices

1. **Never Persist Tokens** - Store in memory only
2. **Token Rotation** - Refresh before expiration
3. **HTTPS Only** - All API calls over secure connections
4. **Scope Minimization** - Request only needed permissions
5. **Audit Logging** - Log all authenticated actions
6. **Rate Limiting** - Enforce quotas server-side
7. **Token Revocation** - Support immediate revocation

---

## Summary

### Authentication is Critical

**Without Auth:**
- ❌ NO agent functionality
- ❌ NO chat features
- ❌ NO tool access
- ❌ NO language models

**With Auth (Minimal):**
- ✅ Basic chat
- ✅ Open file context
- ✅ Limited tools
- ❌ No repository context

**With Auth (Permissive):**
- ✅ Full chat features
- ✅ Repository context
- ✅ All tools
- ✅ Advanced integrations

### Key Patterns to Apply

1. **Layered Architecture** - Service → Manager → Token → Features
2. **Token Exchange** - OAuth token → App token → Feature flags
3. **Automatic Refresh** - Transparent to user when possible
4. **Graceful Degradation** - Fallback to limited features
5. **Quota Enforcement** - Server-side tracking, client-side UX
6. **Feature Flags** - Server-controlled feature rollout
7. **Context Keys** - UI visibility based on auth state

---

**Generated:** 2025-11-20
**Source:** VSCode Copilot Chat Extension - Authentication Analysis
