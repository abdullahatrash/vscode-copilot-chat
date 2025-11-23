# FlowLeap Conversion Quick Reference

## TL;DR - Exact Lines to Change

This is your cheat sheet for the minimal changes needed to get your backend working.

---

## Step 1: Bypass GitHub Token Requirement

### File: `src/extension/conversation/vscode-node/languageModelAccess.ts`

**Find** (around line 400-420 in `CopilotLanguageModelWrapper.provideLanguageModelResponse`):
```typescript
const copilotToken = await this._authService.getCopilotToken();
if (!copilotToken) {
    throw new Error('No Copilot token available');
}
```

**Replace with**:
```typescript
// Import at top of file
import { FlowLeapEndpoint } from '../../../extension/byok/node/flowleapEndpoint';

// In the method:
const isFlowLeapModel = endpoint instanceof FlowLeapEndpoint;
if (!isFlowLeapModel) {
    const copilotToken = await this._authService.getCopilotToken();
    if (!copilotToken) {
        throw new Error('No Copilot token available');
    }
}
```

---

## Step 2: Create Your Endpoint

### File: `src/extension/byok/node/flowleapEndpoint.ts` (NEW)

Copy from the script output or create:
```typescript
import { OpenAIEndpoint } from './openAIEndpoint';
// ... (see FLOWLEAP_CONVERSION_GUIDE.md Phase 2.1 for full code)
```

---

## Step 3: Register Your Model

### File: `src/extension.ts` (or wherever activation happens)

**Find** the `activate` function and **add**:
```typescript
import { FlowLeapEndpoint } from './extension/byok/node/flowleapEndpoint';

export async function activate(context: vscode.ExtensionContext) {
    // ... existing code ...

    // Add FlowLeap model
    const flowleapEndpoint = new FlowLeapEndpoint(
        {
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
        },
        authenticationService,
        configService,
        telemetryService
    );

    // Register with VS Code
    context.subscriptions.push(
        vscode.lm.registerChatModelProvider(
            'copilot',
            'flowleap-patent-gpt',
            {
                provideLanguageModelResponse(messages, options, token) {
                    return flowleapEndpoint.makeChatRequest(messages, options, token);
                }
            }
        )
    );

    // ... rest of activation ...
}
```

---

## Step 4: Add Configuration

### File: `package.json`

**Find** `"contributes"` section and **add**:
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
          "description": "FlowLeap API key"
        }
      }
    }
  }
}
```

---

## Step 5: Test Configuration

### File: `.vscode/settings.json` (create if needed)

```json
{
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions",
  "flowleap.apiKey": ""
}
```

---

## Testing Steps

### 1. Start Your Backend
```bash
cd patent-ai-backend
npm start
# Should be running on http://localhost:8000
```

### 2. Launch Extension in Debug Mode
- Press F5 in VS Code
- A new "Extension Development Host" window opens

### 3. Open Chat Panel
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
- Type "Chat: Open Chat"
- Select "flowleap-patent-gpt" model

### 4. Send Test Message
```
Hello! Can you help me search for patents?
```

### 5. Check Logs
- In the Extension Development Host window:
  - Help > Toggle Developer Tools
  - Console tab - look for network requests
- In your backend:
  - Should see POST request to `/v1/chat/completions`

---

## Common Issues

### Issue: "No Copilot token available"
**Cause**: Token check not bypassed
**Fix**: Double-check Step 1 changes in `languageModelAccess.ts`

### Issue: "Cannot find module 'FlowLeapEndpoint'"
**Cause**: Import path wrong
**Fix**: Ensure file exists at `src/extension/byok/node/flowleapEndpoint.ts`

### Issue: Backend not receiving requests
**Cause**: URL misconfigured
**Fix**: Check `flowleap.apiUrl` in settings.json

### Issue: "Model not found"
**Cause**: Model not registered
**Fix**: Check Step 3 registration in `activate()`

### Issue: TypeScript errors
**Cause**: Missing type definitions
**Fix**: Run `npm install` to get all types

---

## Backend Requirements

Your backend MUST respond with OpenAI-compatible format:

### Request (from extension):
```json
POST /v1/chat/completions
{
  "model": "flowleap-patent-gpt",
  "messages": [...],
  "stream": true,
  "tools": [...]
}
```

### Response (from your backend):
**Streaming** (Server-Sent Events):
```
data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"1","choices":[{"delta":{"content":"!"}}]}
data: [DONE]
```

**Non-streaming** (JSON):
```json
{
  "id": "chatcmpl-123",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! I can help with patent searches."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

---

## Tool Calls Example

### Request with tools:
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "patent_search",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "database": { "type": "string" }
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

### Response (tool call):
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_123",
        "type": "function",
        "function": {
          "name": "patent_search",
          "arguments": "{\"query\":\"neural networks\",\"database\":\"uspto\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

### Tool result (sent back):
```json
{
  "messages": [
    {
      "role": "tool",
      "tool_call_id": "call_123",
      "content": "{\"results\":[{\"patent_number\":\"US1234567\",...}]}"
    }
  ]
}
```

### Final response:
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "I found 10 patents related to neural networks. Here's US1234567..."
    },
    "finish_reason": "stop"
  }]
}
```

---

## File Checklist

### Files to Create:
- [ ] `src/extension/byok/node/flowleapEndpoint.ts`
- [ ] `src/extension/tools/node/patent/patentSearchTool.ts` (optional)
- [ ] `src/extension/tools/node/patent/patentAnalysisTool.ts` (optional)
- [ ] `.vscode/settings.json`

### Files to Modify:
- [ ] `src/extension/conversation/vscode-node/languageModelAccess.ts` (bypass token)
- [ ] `src/extension.ts` (register model)
- [ ] `package.json` (add config schema)

### Files to Read First:
- [ ] `FLOWLEAP_CONVERSION_GUIDE.md` (full instructions)
- [ ] `ARCHITECTURE_COMPARISON.md` (understand the changes)
- [ ] `CONVERSION_STATUS.md` (checklist)

---

## Debugging Tips

### Enable Verbose Logging

Add to `.vscode/settings.json`:
```json
{
  "github.copilot.advanced.debug.enable": true,
  "github.copilot.advanced.debug.enableVerbose": true
}
```

Check logs:
- Output panel → "Copilot Chat" or "FlowLeap"
- Developer Tools → Console

### Network Inspection

In Extension Development Host:
1. Help > Toggle Developer Tools
2. Network tab
3. Filter: "chat/completions"
4. Inspect request/response

### Backend Logging

Add to your backend:
```javascript
app.post('/v1/chat/completions', (req, res) => {
    console.log('Received request:', JSON.stringify(req.body, null, 2));
    // ... handle request
});
```

---

## Quick Commands

### Run Extension
```bash
# In VS Code
Press F5

# Or from command line
code --extensionDevelopmentPath=. --inspect-extensions=9229
```

### Build Extension
```bash
npm run compile
```

### Package Extension
```bash
npm install -g vsce
vsce package
# Creates flowleap-patent-ide-0.1.0.vsix
```

### Install Packaged Extension
```bash
code --install-extension flowleap-patent-ide-0.1.0.vsix
```

---

## Success Criteria

You know it's working when:

1. ✅ Extension activates without GitHub login
2. ✅ Chat panel shows "flowleap-patent-gpt" model
3. ✅ Sending a message triggers HTTP request to `localhost:8000`
4. ✅ Backend logs show incoming request
5. ✅ Chat panel displays response from your backend
6. ✅ Tool calls work (if implemented)

---

## Next Steps After Basic Setup

1. **Update Agent Identity**
   - Modify prompts to reflect patent focus
   - See Phase 4 in FLOWLEAP_CONVERSION_GUIDE.md

2. **Add Patent Tools**
   - Implement `patent_search`, `analyze_patent`, etc.
   - See Phase 6 in FLOWLEAP_CONVERSION_GUIDE.md

3. **Remove GitHub Features**
   - Clean up participant registrations
   - See Phase 5 in FLOWLEAP_CONVERSION_GUIDE.md

4. **Rebrand Extension**
   - Update package.json metadata
   - Add custom icon
   - See Phase 1 in FLOWLEAP_CONVERSION_GUIDE.md

5. **Polish and Package**
   - Add documentation
   - Create marketplace listing
   - Distribute to team

---

## Support Resources

- **Full Guide**: `FLOWLEAP_CONVERSION_GUIDE.md`
- **Architecture**: `ARCHITECTURE_COMPARISON.md`
- **Status Tracker**: `CONVERSION_STATUS.md`
- **VS Code API Docs**: https://code.visualstudio.com/api
- **Language Model API**: https://code.visualstudio.com/api/extension-guides/language-model

---

## Emergency Rollback

If something breaks:

```bash
# Restore original package.json
mv package.json.backup package.json

# Revert code changes
git checkout .

# Or revert specific file
git checkout src/extension/conversation/vscode-node/languageModelAccess.ts
```

---

Good luck! You're about to turn this into FlowLeap Patent IDE! 🚀
