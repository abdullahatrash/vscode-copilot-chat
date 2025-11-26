# Adding New Tools to Patent AI IDE

This document describes the pattern for adding new tools that the LLM can use in Patent AI mode.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension                                           │
│  ┌─────────────────────┐                                    │
│  │ myNewTool.ts        │ ◄── LLM calls this (registered)    │
│  │ (thin client)       │                                    │
│  └──────────┬──────────┘                                    │
│             │ HTTP POST                                      │
└─────────────┼───────────────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Patent AI Backend (localhost:8000)                          │
│  ┌─────────────────────┐                                    │
│  │ /v1/my-endpoint     │ ◄── Business logic here            │
│  │ (handles auth, API) │                                    │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step Guide

### 1. Add Tool Name to `toolNames.ts`

**File:** `src/extension/tools/common/toolNames.ts`

Add to `ToolName` enum:
```typescript
export enum ToolName {
    // ... existing tools
    MyNewTool = 'my_new_tool',
}
```

Add to `ContributedToolName` enum:
```typescript
export enum ContributedToolName {
    // ... existing tools
    MyNewTool = 'copilot_myNewTool',
}
```

Add to `toolCategories`:
```typescript
export const toolCategories: Record<ToolName, ToolCategory> = {
    // ... existing tools
    [ToolName.MyNewTool]: ToolCategory.WebInteraction, // or appropriate category
};
```

### 2. Register Tool in `package.json`

**File:** `package.json` under `contributes.languageModelTools`

```json
{
    "name": "copilot_myNewTool",
    "displayName": "My New Tool",
    "toolReferenceName": "mytool",
    "when": "!isWeb",
    "canBeReferencedInPrompt": true,
    "icon": "$(search)",
    "userDescription": "Description shown to user",
    "modelDescription": "Detailed description for LLM. Explain WHEN to use this tool and HOW. Be specific about parameters.",
    "tags": [],
    "inputSchema": {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Description of param1"
            },
            "param2": {
                "type": "string",
                "description": "Description of param2",
                "default": "default-value"
            }
        },
        "required": ["param1"]
    }
}
```

**Important:** The `modelDescription` is what the LLM sees. Make it detailed and explain when the tool should be used.

### 3. Create Tool Implementation

**File:** `src/extension/tools/vscode-node/myNewTool.ts`

```typescript
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

interface IMyNewToolParams {
    param1: string;
    param2?: string;
}

interface MyNewToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

class MyNewTool implements ICopilotTool<IMyNewToolParams> {

    public static readonly toolName = ToolName.MyNewTool;

    constructor(
        @ILogService private readonly logService: ILogService
    ) { }

    prepareInvocation(
        _options: vscode.LanguageModelToolInvocationPrepareOptions<IMyNewToolParams>,
        _token: CancellationToken
    ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
        const { param1 } = _options.input;
        return {
            invocationMessage: l10n.t`Processing: ${param1}`,
            confirmationMessages: {
                title: l10n.t`My New Tool`,
                message: l10n.t`Allow Patent AI to process: ${param1}?`
            }
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IMyNewToolParams>,
        token: CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { param1, param2 = 'default' } = options.input;

        try {
            // Get backend URL
            const backendUrl = process.env.PATENT_API_URL || 'http://localhost:8000/v1/chat/completions';
            const baseUrl = backendUrl.replace('/v1/chat/completions', '');
            const endpointUrl = `${baseUrl}/v1/my-endpoint`;

            // Call backend
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ param1, param2 }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return new LanguageModelToolResult([
                    new LanguageModelTextPart(`Error: ${response.status}: ${errorText}`)
                ]);
            }

            const result = await response.json() as MyNewToolResult;

            if (!result.success) {
                return new LanguageModelToolResult([
                    new LanguageModelTextPart(`Error: ${result.error}`)
                ]);
            }

            // Format and return results
            return new LanguageModelToolResult([
                new LanguageModelTextPart(this.formatResults(result))
            ]);

        } catch (error) {
            return new LanguageModelToolResult([
                new LanguageModelTextPart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
            ]);
        }
    }

    private formatResults(result: MyNewToolResult): string {
        // Format results for LLM consumption
        return JSON.stringify(result.data, null, 2);
    }
}

ToolRegistry.registerTool(MyNewTool);
```

### 4. Import Tool in `allTools.ts`

**File:** `src/extension/tools/vscode-node/allTools.ts`

```typescript
import './fetchWebPageTool';
import './searchPatentsTool';
import './writePatentResultsTool';
import './myNewTool';  // Add this line
```

### 5. Enable Tool in Agent Mode (CRITICAL!)

**File:** `src/extension/intents/node/agentIntent.ts`

Find the Patent AI tools section and add your tool:

```typescript
// Enable Patent AI tools when in Patent AI mode
if (process.env.PATENT_AI_MODE === 'true') {
    allowTools[ToolName.SearchPatents] = true;
    allowTools[ToolName.WritePatentResults] = true;
    allowTools[ToolName.MyNewTool] = true;  // Add this line
}
```

**This step is critical!** Without this, the tool won't be available to the LLM even if everything else is configured correctly.

### 6. Create Backend Endpoint

**File:** `/Users/neoak/projects/patnet-ai-backend/src/routes/my-endpoint.ts`

```typescript
import { Router, Request, Response } from 'express';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    const { param1, param2 } = req.body;

    if (!param1) {
        return res.status(400).json({
            success: false,
            error: 'Missing required field: param1'
        });
    }

    try {
        // Your business logic here
        const result = await doSomething(param1, param2);

        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal error'
        });
    }
});

export default router;
```

### 7. Register Backend Route

**File:** `/Users/neoak/projects/patnet-ai-backend/src/server.ts`

```typescript
import myEndpointRouter from './routes/my-endpoint.js';

// Add route
app.use('/v1/my-endpoint', myEndpointRouter);
```

### 8. Build and Test

```bash
# Build backend
cd /Users/neoak/projects/patnet-ai-backend
npm run build && npm run dev

# Build extension
cd /Users/neoak/projects/vscode-copilot-chat
npm run compile

# Launch
./launch-patent-mode.sh
```

## Checklist

- [ ] Tool name added to `ToolName` enum
- [ ] Tool name added to `ContributedToolName` enum
- [ ] Tool added to `toolCategories`
- [ ] Tool registered in `package.json` with `modelDescription`
- [ ] Tool implementation created in `src/extension/tools/vscode-node/`
- [ ] Tool imported in `allTools.ts`
- [ ] Tool enabled in `agentIntent.ts` for Patent AI mode
- [ ] Backend endpoint created
- [ ] Backend route registered in `server.ts`
- [ ] Both extension and backend rebuilt

## Common Issues

### Tool not being called by LLM
- Check `agentIntent.ts` - tool must be in `allowTools`
- Check `package.json` - `modelDescription` should clearly explain when to use the tool

### Tool returns error
- Test backend endpoint directly with curl
- Check extension console for errors

### Tool not visible in tool picker
- Verify `package.json` registration
- Check `when` condition (e.g., `!isWeb`)
