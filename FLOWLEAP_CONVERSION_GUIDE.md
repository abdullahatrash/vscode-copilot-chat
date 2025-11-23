# FlowLeap Patent IDE Conversion Guide

## Overview

This guide provides exact steps to convert the `vscode-copilot-chat` extension into your own **FlowLeap Patent IDE** extension with a custom backend at `http://localhost:8000/v1/chat/completions`.

## Architecture Understanding

### Request Flow
```
Agent/User Request
  → LanguageModelAccess (VS Code API)
  → CopilotLanguageModelWrapper
  → IChatEndpoint (ChatEndpoint/OpenAIEndpoint)
  → ChatMLFetcher
  → postRequest()
  → HTTP Request to Backend
```

### Key Decision Point

You have two main approaches:

1. **Approach A**: Extend OpenAIEndpoint (simpler, less invasive)
2. **Approach B**: Create custom endpoint bypassing CAPI entirely (cleaner long-term)

We recommend **Approach A** for initial conversion, then migrate to **Approach B** later.

---

## Phase 1: Extension Rebranding

### Step 1.1: Update package.json

**File**: `package.json`

**Changes**:
```json
{
  "name": "flowleap-patent-ide",
  "displayName": "FlowLeap Patent IDE",
  "description": "AI-powered patent prosecution assistant",
  "version": "0.1.0",
  "publisher": "flowleap",
  "icon": "assets/flowleap-icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/flowleap/vscode-patent-ide"
  },
  "homepage": "https://flowleap.com/patent-ide",
  "bugs": {
    "url": "https://github.com/flowleap/patent-ide/issues"
  }
}
```

### Step 1.2: Remove GitHub-specific contribution points

**File**: `package.json`

**Remove or comment out** (you can delete these later):
```json
{
  "contributes": {
    "chatParticipants": [
      // REMOVE: GitHub CLI agent, PR review agent, etc.
      // KEEP: @workspace, @edit (if you want inline editing)
    ],
    "chatSessions": [
      // REMOVE: Claude Code CLI session
    ],
    "languageModelTools": [
      // REMOVE: GitHub-specific tools (pr_review, gh_cli, etc.)
      // KEEP: Core tools (readFile, listDirectory, executeCommand, etc.)
    ]
  }
}
```

### Step 1.3: Update activation events

**File**: `package.json`

Keep minimal activation:
```json
{
  "activationEvents": [
    "onLanguageModelAccess:copilot",
    "onCommand:flowleap.chat.open"
  ]
}
```

---

## Phase 2: Backend Swap (Approach A - OpenAI Endpoint)

### Step 2.1: Create FlowLeap Endpoint Class

**New File**: `src/extension/byok/node/flowleapEndpoint.ts`

```typescript
import { OpenAIEndpoint } from './openAIEndpoint';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigService } from '../../../platform/config/common/config';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';

export class FlowLeapEndpoint extends OpenAIEndpoint {
    constructor(
        modelMetadata: IChatModelInformation,
        authService: IAuthenticationService,
        configService: IConfigService,
        telemetryService: ITelemetryService
    ) {
        // Get API key from config or environment
        const apiKey = configService.get('flowleap.apiKey') || process.env.FLOWLEAP_API_KEY || '';

        // Point to your backend
        const baseUrl = configService.get('flowleap.apiUrl') || 'http://localhost:8000/v1/chat/completions';

        super(
            modelMetadata,
            apiKey,
            baseUrl,
            authService,
            configService,
            telemetryService,
            undefined, // logService
            undefined, // outputChannelService
            undefined  // capiClientService
        );
    }

    // Override to add custom headers if needed
    override get requestHeaders(): Record<string, string> {
        const base = super.requestHeaders;
        return {
            ...base,
            'X-FlowLeap-Client': 'vscode-extension',
            'X-FlowLeap-Version': '0.1.0'
        };
    }

    // Override body creation if your backend needs different format
    override createRequestBody(
        options: any,
        model: string,
        callback: any
    ): any {
        const body = super.createRequestBody(options, model, callback);

        // Add FlowLeap-specific fields if needed
        // body.custom_field = 'value';

        return body;
    }
}
```

### Step 2.2: Register FlowLeap as a Model Provider

**File**: `src/extension/byok/vscode-node/flowleapProvider.ts`

```typescript
import * as vscode from 'vscode';
import { FlowLeapEndpoint } from '../node/flowleapEndpoint';
import { ByokChatModelProvider } from './byokChatModelProvider';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigService } from '../../../platform/config/common/config';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';

export class FlowLeapProvider extends ByokChatModelProvider {
    constructor(
        context: vscode.ExtensionContext,
        authService: IAuthenticationService,
        configService: IConfigService,
        telemetryService: ITelemetryService
    ) {
        super(
            'flowleap',
            'FlowLeap Patent AI',
            context,
            authService,
            configService,
            telemetryService
        );
    }

    override async createEndpoint(): Promise<FlowLeapEndpoint> {
        const modelMetadata = {
            id: 'flowleap-patent-gpt',
            name: 'FlowLeap Patent GPT',
            version: '1.0',
            capabilities: {
                family: 'gpt-4',
                tokenizer: 'cl100k_base',
                limits: {
                    max_prompt_tokens: 128000,
                    max_output_tokens: 16384
                },
                supports: {
                    streaming: true,
                    tool_calls: true,
                    vision: false,
                    prediction: false
                }
            }
        };

        return new FlowLeapEndpoint(
            modelMetadata,
            this.authService,
            this.configService,
            this.telemetryService
        );
    }

    override async getAvailableModels(): Promise<string[]> {
        return ['flowleap-patent-gpt'];
    }
}
```

### Step 2.3: Register Provider in Extension Activation

**File**: `src/extension.ts` (or wherever your activation happens)

Find the activation function and add:

```typescript
import { FlowLeapProvider } from './extension/byok/vscode-node/flowleapProvider';

export async function activate(context: vscode.ExtensionContext) {
    // ... existing activation code ...

    // Register FlowLeap provider
    const flowleapProvider = new FlowLeapProvider(
        context,
        authService,
        configService,
        telemetryService
    );

    context.subscriptions.push(
        vscode.lm.registerChatModelProvider(
            'copilot',
            'flowleap-patent-gpt',
            flowleapProvider
        )
    );

    // ... rest of activation ...
}
```

### Step 2.4: Add Configuration Schema

**File**: `package.json` under `contributes.configuration`

```json
{
  "contributes": {
    "configuration": {
      "title": "FlowLeap Patent IDE",
      "properties": {
        "flowleap.apiUrl": {
          "type": "string",
          "default": "http://localhost:8000/v1/chat/completions",
          "description": "FlowLeap API endpoint URL"
        },
        "flowleap.apiKey": {
          "type": "string",
          "default": "",
          "description": "FlowLeap API key (optional, can use environment variable FLOWLEAP_API_KEY)"
        },
        "flowleap.defaultModel": {
          "type": "string",
          "default": "flowleap-patent-gpt",
          "description": "Default model to use"
        }
      }
    }
  }
}
```

---

## Phase 3: Remove GitHub Authentication Dependency

### Step 3.1: Bypass Copilot Token Requirement

**File**: `src/extension/conversation/vscode-node/languageModelAccess.ts`

Find `CopilotLanguageModelWrapper` class and modify token validation:

**Original** (around line 400):
```typescript
const copilotToken = await this._authService.getCopilotToken();
if (!copilotToken) {
    throw new Error('No Copilot token available');
}
```

**Replace with**:
```typescript
// For FlowLeap models, skip Copilot token check
const isFlowLeapModel = endpoint instanceof FlowLeapEndpoint;
if (!isFlowLeapModel) {
    const copilotToken = await this._authService.getCopilotToken();
    if (!copilotToken) {
        throw new Error('No Copilot token available');
    }
}
```

### Step 3.2: Update Authentication Service

**File**: `src/platform/authentication/node/authenticationService.ts`

Add a bypass for FlowLeap:

```typescript
async getCopilotToken(options?: GetTokenOptions): Promise<CopilotToken | undefined> {
    // Check if we're using FlowLeap backend
    const useFlowLeap = this._configService.get('flowleap.enabled');
    if (useFlowLeap) {
        // Return a mock token that won't be used
        return undefined;
    }

    // Original GitHub token logic
    return this._copilotTokenManager.getCopilotToken(options);
}
```

---

## Phase 4: Update Agent Prompts and Identity

### Step 4.1: Modify Agent System Prompt

**File**: `src/extension/prompts/node/agent/defaultAgentPrompt.ts`

Find the system message construction and replace:

**Original**:
```typescript
const identity = "You are GitHub Copilot, an AI coding assistant...";
```

**Replace with**:
```typescript
const identity = `You are FlowLeap Patent IDE, an AI assistant specialized in patent prosecution.

You help patent professionals with:
- Prior art search and analysis
- Patent claim drafting and refinement
- Office action response preparation
- Patent landscape analysis
- USPTO/EPO/WIPO database queries

You have access to patent-specific tools and databases.`;
```

### Step 4.2: Update Tool Usage Instructions

**Same file**, add patent-specific tool guidance:

```typescript
const toolGuidance = `
When working with patents:
1. Always cite patent numbers with proper formatting (US1234567, EP1234567, etc.)
2. Use patent search tools before making claims about prior art
3. Maintain claim numbering consistency
4. Follow USPTO/EPO formatting guidelines
5. Track file wrapper history and citations
`;
```

---

## Phase 5: Remove Unwanted Features

### Step 5.1: Disable GitHub-Specific Participants

**File**: `src/extension/chat/vscode-node/participantRegistration.ts`

Comment out or remove:
```typescript
// REMOVE OR COMMENT OUT:
// - registerPRReviewParticipant()
// - registerGitHubCLIParticipant()
// - registerClaudeCodeParticipant()

// KEEP:
// - registerWorkspaceParticipant()
// - registerEditParticipant() (if you want inline editing)
```

### Step 5.2: Disable GitHub Tools

**File**: `src/extension/tools/node/toolRegistry.ts`

Remove tool registrations:
```typescript
// REMOVE:
registerTool(new GitHubPRTool(...));
registerTool(new GitHubIssueTool(...));
registerTool(new GitHubCLITool(...));

// KEEP:
registerTool(new ReadFileTool(...));
registerTool(new ListDirectoryTool(...));
registerTool(new ExecuteCommandTool(...));
```

---

## Phase 6: Add Patent-Specific Tools

### Step 6.1: Create Patent Search Tool

**New File**: `src/extension/tools/node/patentSearchTool.ts`

```typescript
import { LanguageModelTool } from 'vscode';

export class PatentSearchTool implements LanguageModelTool {
    name = 'patent_search';
    description = 'Search patent databases (USPTO, EPO, WIPO) for prior art';

    inputSchema = {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query (keywords, IPC classes, or patent numbers)'
            },
            database: {
                type: 'string',
                enum: ['uspto', 'epo', 'wipo', 'all'],
                description: 'Which patent database to search'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10
            }
        },
        required: ['query']
    };

    async invoke(input: any, token: CancellationToken): Promise<any> {
        // Call your patent-ai-backend API
        const response = await fetch('http://localhost:8000/api/patent/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: input.query,
                database: input.database || 'all',
                limit: input.limit || 10
            })
        });

        const results = await response.json();

        return {
            results: results.patents,
            count: results.count,
            query: input.query
        };
    }
}
```

### Step 6.2: Create Patent Analysis Tool

**New File**: `src/extension/tools/node/patentAnalysisTool.ts`

```typescript
export class PatentAnalysisTool implements LanguageModelTool {
    name = 'analyze_patent';
    description = 'Analyze a patent document for claims, prior art, and prosecution history';

    inputSchema = {
        type: 'object',
        properties: {
            patent_number: {
                type: 'string',
                description: 'Patent number (e.g., US1234567, EP1234567)'
            },
            analysis_type: {
                type: 'string',
                enum: ['claims', 'prior_art', 'prosecution_history', 'full'],
                description: 'Type of analysis to perform'
            }
        },
        required: ['patent_number']
    };

    async invoke(input: any, token: CancellationToken): Promise<any> {
        const response = await fetch('http://localhost:8000/api/patent/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patent_number: input.patent_number,
                analysis_type: input.analysis_type || 'full'
            })
        });

        return await response.json();
    }
}
```

### Step 6.3: Register Patent Tools

**File**: `src/extension/tools/node/toolRegistry.ts`

```typescript
import { PatentSearchTool } from './patentSearchTool';
import { PatentAnalysisTool } from './patentAnalysisTool';

// In the registration function:
registerTool(new PatentSearchTool());
registerTool(new PatentAnalysisTool());
```

---

## Phase 7: Testing and Validation

### Step 7.1: Test Backend Connection

1. Start your backend: `cd patent-ai-backend && npm start`
2. Launch extension in debug mode (F5 in VS Code)
3. Open chat panel
4. Send a test message
5. Check VS Code output panel for request logs

### Step 7.2: Test Tool Invocation

Send to chat:
```
Can you search for patents related to "AI patent classification"?
```

Should trigger `patent_search` tool.

### Step 7.3: Verify No GitHub Dependencies

1. Sign out of GitHub in VS Code
2. Extension should still work with FlowLeap backend
3. Check that no GitHub API calls are made (check network logs)

---

## Phase 8: Cleanup (Optional, Do Later)

### Remove Dead Code

Once everything works, you can remove:

1. **Authentication code**:
   - `src/platform/authentication/` (GitHub session handling)

2. **CAPI Client**:
   - `node_modules/@vscode/copilot-api` dependency
   - `src/platform/networking/` CAPI routing

3. **GitHub-specific features**:
   - `src/extension/github/` (PR reviews, issues, etc.)
   - `src/extension/cli/` (Claude Code CLI)

4. **Telemetry** (if you don't want to send to GitHub):
   - `src/platform/telemetry/` or replace with your own

---

## Architecture Comparison

### Before (GitHub Copilot)
```
VS Code Chat UI
  → LanguageModelAccess
  → ChatEndpoint (CAPI routing)
  → GitHub Copilot API (api.githubcopilot.com)
  → OpenAI/Azure/Anthropic (backend)
```

### After (FlowLeap)
```
VS Code Chat UI
  → LanguageModelAccess
  → FlowLeapEndpoint (direct HTTP)
  → Your Backend (localhost:8000)
  → Your LLM (OpenAI/Claude/etc.)
```

---

## Configuration File Example

**.vscode/settings.json** (for testing):
```json
{
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions",
  "flowleap.apiKey": "",
  "flowleap.defaultModel": "flowleap-patent-gpt",
  "flowleap.enabled": true
}
```

---

## Next Steps

1. Follow Phase 1-2 to get basic backend working
2. Test with simple chat messages
3. Add patent tools (Phase 6)
4. Customize prompts (Phase 4)
5. Remove unwanted features (Phase 5)
6. Polish and package

---

## Troubleshooting

### Issue: "No Copilot token available"
- Check Step 3.1 - ensure FlowLeap models bypass token check
- Verify `flowleap.enabled` is true in settings

### Issue: Backend not receiving requests
- Check `flowleap.apiUrl` in settings
- Verify backend is running on port 8000
- Check browser/VS Code network logs

### Issue: Tool calls not working
- Ensure your backend returns tool calls in OpenAI format
- Check tool registration in `toolRegistry.ts`
- Verify `capabilities.supports.tool_calls = true` in model metadata

### Issue: Extension doesn't activate
- Check activation events in `package.json`
- Look for errors in "Help > Toggle Developer Tools" console
- Check extension host logs

---

## Files Summary

### Files to Create:
- `src/extension/byok/node/flowleapEndpoint.ts`
- `src/extension/byok/vscode-node/flowleapProvider.ts`
- `src/extension/tools/node/patentSearchTool.ts`
- `src/extension/tools/node/patentAnalysisTool.ts`

### Files to Modify:
- `package.json` (branding, config, contributions)
- `src/extension.ts` (register FlowLeap provider)
- `src/extension/conversation/vscode-node/languageModelAccess.ts` (bypass token)
- `src/platform/authentication/node/authenticationService.ts` (bypass GitHub auth)
- `src/extension/prompts/node/agent/defaultAgentPrompt.ts` (identity)
- `src/extension/tools/node/toolRegistry.ts` (register patent tools)
- `src/extension/chat/vscode-node/participantRegistration.ts` (remove GitHub participants)

### Files to Eventually Delete:
- `src/extension/github/**` (PR reviews, issues)
- `src/extension/cli/**` (Claude Code CLI)
- Most of `src/platform/authentication/**` (GitHub sessions)
- CAPI-specific networking code (after full migration)

---

## Timeline Estimate

**Quick PoC** (2-3 days):
- Phase 1-2: Basic backend swap
- Phase 7: Testing

**Full Feature Parity** (1-2 weeks):
- Phase 3-6: Remove GitHub deps, add patent tools
- Phase 8: Cleanup

**Production Ready** (3-4 weeks):
- Polish UI/UX
- Add telemetry
- Write documentation
- Package and distribute

---

Good luck! You now have a complete blueprint for converting this extension into FlowLeap Patent IDE.
