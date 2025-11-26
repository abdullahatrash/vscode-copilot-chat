# Patent Search Tool - VS Code Extension Implementation

**Date:** November 23, 2025
**Status:** ✅ Implemented and Ready for Testing

---

## Summary

Successfully implemented `search_patents` as a **native VS Code extension tool** following the same pattern as all other VS Code tools (like `fetch_webpage`, `read_file`, etc.). This is much simpler and more maintainable than backend tool execution.

---

## Implementation Details

### 1. Tool Name Registration

**File:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/common/toolNames.ts`

Added `SearchPatents` to:
- `ToolName` enum (line 72)
- `ContributedToolName` enum (line 116)
- `toolCategories` mapping under `WebInteraction` category (line 199)

### 2. Tool Implementation

**File:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/vscode-node/searchPatentsTool.ts`

Created new tool class implementing `ICopilotTool<ISearchPatentsParams>` with:

**Features:**
- ✅ OAuth2 token management with caching (30-second buffer before expiry)
- ✅ EPO OPS API integration for patent search
- ✅ CQL (Common Patent Query Language) support
- ✅ JSON response parsing
- ✅ User-friendly result formatting
- ✅ Confirmation dialog before execution
- ✅ Proper error handling and logging

**Methods:**
- `prepareInvocation()` - Shows confirmation dialog
- `invoke()` - Executes patent search
- `getAccessToken()` - OAuth2 token management
- `searchPatents()` - Makes EPO API request
- `formatSearchResults()` - Formats results for LLM

### 3. Tool Registration

**File:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/vscode-node/allTools.ts`

Added import: `import './searchPatentsTool';` (line 9)

### 4. Backend Updated

**File:** `/Users/neoak/projects/patnet-ai-backend/src/routes/completions.ts`

Removed backend tool merging logic since patent tools are now extension tools

---

## Credentials Management

### Current Approach (Temporary)

Using **environment variables**:
```typescript
const clientId = process.env.EPO_CLIENT_ID;
const clientSecret = process.env.EPO_CLIENT_SECRET;
```

**Setup:**
```bash
export EPO_CLIENT_ID="your-consumer-key"
export EPO_CLIENT_SECRET="your-consumer-secret"
```

Then launch VS Code:
```bash
cd /Users/neoak/projects/vscode-copilot-chat
./launch-patent-mode.sh
```

### Future Approach (Production)

Use **VS Code SecretStorage API** (encrypted, per-user):

```typescript
// Store credentials (one-time setup)
await context.secrets.store('epo_client_id', 'your-key');
await context.secrets.store('epo_client_secret', 'your-secret');

// Retrieve when needed
const clientId = await context.secrets.get('epo_client_id');
const clientSecret = await context.secrets.get('epo_client_secret');
```

**Benefits:**
- ✅ Encrypted storage
- ✅ Per-user credentials
- ✅ Follows VS Code best practices
- ✅ Same pattern as GitHub Copilot

---

## Tool Behavior

### LLM Perspective

When the LLM sees this tool:
```json
{
  "name": "copilot_searchPatents",
  "description": "Search patent databases using CQL...",
  "parameters": {
    "query": {
      "type": "string",
      "description": "CQL query string. Examples: 'pa=Microsoft AND ic=G06N'..."
    },
    "range": {
      "type": "string",
      "description": "Result range like '1-25'",
      "default": "1-25"
    }
  }
}
```

### User Perspective

When the tool is invoked:
1. **Confirmation Dialog** appears:
   - Title: "Search Patents"
   - Message: "Allow Patent AI to search for patents using query: pa=Microsoft AND ic=G06N?"
   - User clicks "Allow" or "Deny"

2. **If Allowed:**
   - Status message: "Searching patents: pa=Microsoft AND ic=G06N"
   - Tool executes EPO API request
   - Results returned to LLM
   - LLM displays results to user

3. **Result Format:**
```
Found 150 patents matching query: "pa=Microsoft AND ic=G06N"
Showing results 1-25:

- US11234567.A1 (Published: 20230515)
- EP3456789.B1 (Published: 20230420)
- US11234568.A1 (Published: 20230510)
...

Note: Use these patent document IDs to fetch detailed information (claims, abstracts, etc.) if needed.
```

---

## System Prompt Integration

The system prompt already instructs the LLM to use `search_patents` for patent queries:

**From:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/prompts/node/agent/defaultAgentInstructions.tsx`

```typescript
{isPatentAIMode && hasSearchPatentsTool && <>
  You have specialized patent analysis capabilities.
  When users ask about patents or patent searches,
  you MUST use the search_patents tool instead of web search tools.
</>}
```

---

## Testing

### Prerequisites

1. **Get EPO Credentials:**
   - Register at https://developers.epo.org/
   - Create an app
   - Get Consumer Key (CLIENT_ID) and Consumer Secret (CLIENT_SECRET)

2. **Set Environment Variables:**
   ```bash
   export EPO_CLIENT_ID="your-consumer-key-here"
   export EPO_CLIENT_SECRET="your-consumer-secret-here"
   export PATENT_AI_MODE="true"
   ```

3. **Launch VS Code:**
   ```bash
   cd /Users/neoak/projects/vscode-copilot-chat
   ./launch-patent-mode.sh
   ```

### Test Cases

#### Test 1: Basic Patent Search
**Query:** "Search for Microsoft patents in class G06N"

**Expected Behavior:**
1. LLM recognizes this as a patent query
2. LLM calls `copilot_searchPatents` tool with query: `pa=Microsoft AND ic=G06N`
3. Confirmation dialog appears
4. User clicks "Allow"
5. Tool executes EPO API request
6. Results displayed

**Success Criteria:**
- ✅ No "copilot_searchCodebase" or web search tools used
- ✅ `search_patents` tool called with correct CQL query
- ✅ Results returned from EPO OPS API
- ✅ Results formatted and displayed

#### Test 2: Multiple Patent Searches
**Query:** "Find Apple patents about displays published in 2023"

**Expected:**
- Tool called with: `pa=Apple AND ti=display AND pd=20230101->20231231`

#### Test 3: Error Handling - Missing Credentials
**Setup:** Unset EPO_CLIENT_ID

**Expected:**
- Error message: "EPO API credentials are not configured"

#### Test 4: Error Handling - Invalid Query
**Query:** "Search for patents with invalid CQL syntax: @#$%"

**Expected:**
- EPO API error returned
- LLM explains the error to user

---

## Backend Logs to Monitor

When testing, watch backend logs:

```bash
tail -f /tmp/backend.log
```

**Expected Output:**
```
[Patent AI] Chat request from VSCode: { toolCount: 34 }
[Patent AI] Using VS Code tools - forwarding to OpenAI
[Patent AI] Total tools available: 34
```

Note: With extension tools, backend should show **34 tools** (33 + 1 patent tool)

---

## Advantages of Extension Tool Approach

1. **Follows VS Code Patterns** - Same as all other tools
2. **Native Integration** - Direct VS Code tool execution
3. **User Confirmation** - Built-in confirmation dialogs
4. **Proper Error Handling** - VS Code error reporting
5. **Easy to Debug** - Standard VS Code tool debugging
6. **No Backend Complexity** - No stream parsing, no agentic loop needed
7. **Credentials via SecretStorage** - VS Code's encrypted storage (future)
8. **Easy to Extend** - Add more patent tools following same pattern

---

## Future Enhancements

### 1. More Patent Tools

Following the same pattern, add:

- `fetch_patent_claims` - Get full claims text
- `fetch_patent_biblio` - Get bibliographic data
- `fetch_patent_family` - Get patent family members
- `fetch_patent_abstract` - Get abstract text

### 2. SecretStorage Implementation

Replace environment variables with VS Code SecretStorage:

```typescript
// In extension activation
const clientId = await context.secrets.get('epo_client_id');
if (!clientId) {
  // Prompt user to enter credentials
  const id = await vscode.window.showInputBox({
    prompt: 'Enter EPO Consumer Key',
    password: true
  });
  await context.secrets.store('epo_client_id', id);
}
```

### 3. Enhanced Result Formatting

Add rich formatting with:
- Patent titles (requires additional API call)
- Applicant names
- Classification codes
- Links to Espacenet

### 4. Caching

Cache search results to reduce API calls:
- Use VS Code's Memento API
- Cache by query hash
- Respect EPO rate limits

---

## Troubleshooting

### Tool Not Appearing

**Check:**
1. Tool registered in `toolNames.ts`?
2. Import added to `allTools.ts`?
3. Extension compiled successfully?
4. VS Code restarted?

### Tool Called But No Results

**Check:**
1. EPO credentials set in environment?
2. Backend logs show tool execution?
3. EPO API responding? (check https://ops.epo.org/)

### Wrong Tool Being Used

**Check:**
1. System prompt includes patent tool awareness?
2. Patent AI mode enabled? (`PATENT_AI_MODE=true`)
3. Tool description clear enough?

---

## Files Modified This Session

1. `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/common/toolNames.ts` (+3 lines)
2. `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/vscode-node/searchPatentsTool.ts` (NEW +270 lines)
3. `/Users/neoak/projects/vscode-copilot-chat/src/extension/tools/vscode-node/allTools.ts` (+1 line)
4. `/Users/neoak/projects/patnet-ai-backend/src/routes/completions.ts` (simplified -25 lines)

---

## Status

✅ **Ready for Testing**

The patent search tool is fully implemented and integrated. Set up EPO credentials and test with the query:

**"Search for Microsoft patents in class G06N"**

This should now work correctly!
