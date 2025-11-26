# Testing Patent AI Code Mapper

## Status: Implementation Complete ✅

### What was implemented:

1. **Backend Code Mapper Endpoint** (`/v1/code-mapper`)
   - Uses Vercel AI SDK's `generateObject()` with Zod schemas
   - Type-safe JSON output for edit operations
   - No authentication required

2. **Extension-side Patent AI Code Mapper**
   - Calls Patent AI backend instead of GitHub Copilot
   - Handles file reading from disk if document not available
   - Applies edits received from backend

3. **Code Mapper Service Integration**
   - Conditional routing based on `PATENT_AI_MODE` environment variable
   - When true: Uses PatentAICodeMapper
   - When false: Uses original GitHub Copilot code mapper

### Testing Steps:

#### 1. Verify Backend is Running
```bash
curl http://localhost:8000/v1/health
```

Expected: `{"status":"ok","service":"Patent AI Backend",...}`

#### 2. Test Backend Code Mapper Directly
```bash
curl -X POST http://localhost:8000/v1/code-mapper \
  -H "Content-Type: application/json" \
  -d '{
    "existingCode": "function greet() {\n  console.log(\"Hello\");\n}",
    "newCode": "console.log(\"World\");",
    "filePath": "test.js",
    "instruction": "Add the new code after the function"
  }'
```

Expected: Returns JSON with `{"success":true,"edits":[...]}`

#### 3. Launch Extension in Debug Mode

**Option A: Using VS Code Debug**
1. Open `/Users/neoak/projects/vscode-copilot-chat` in VS Code
2. Press F5 or use "Launch Copilot Extension" configuration
3. This automatically sets `PATENT_AI_MODE=true` (see line 18 in launch.json)

**Option B: Using Command Line**
```bash
cd /Users/neoak/projects/vscode-copilot-chat
./launch-patent-ide.sh
```

#### 4. Test File Editing Without GitHub Copilot Auth

In the launched VS Code instance:

1. Open the test file: `/Users/neoak/projects/vscode-copilot-chat/test-edit.js`
2. Open Copilot Chat panel
3. Try editing the file:
   - Example prompt: "Add a comment at the top of the file explaining what it does"
   - Example prompt: "Add a new function called 'farewell' that logs 'Goodbye'"

**Expected Result:**
- File should be edited successfully
- NO 401 "token expired or invalid" errors
- Logs should show: `[Patent AI] Using Patent AI Code Mapper`

#### 5. Check Logs

Look for these log messages in the Extension Host output:
```
[Patent AI] Using Patent AI Code Mapper
[Patent AI Code Mapper] ========== REQUEST ==========
[Patent AI Code Mapper] File: /path/to/file
[Patent AI Code Mapper] Applying X edits
[Patent AI Code Mapper] ✅ Code mapping complete
```

### Environment Variables

The following environment variables are configured in launch.json:
- `PATENT_AI_MODE=true` - Enables Patent AI Code Mapper
- `PATENT_API_URL` - Defaults to `http://localhost:8000` if not set
- `COPILOT_LOG_TELEMETRY=true` - Enable logging

### Troubleshooting

**If you still get 401 errors:**
- Check that `PATENT_AI_MODE=true` is set in environment
- Check Extension Host logs for "[Patent AI] Using Patent AI Code Mapper" message
- Verify backend is running: `curl http://localhost:8000/v1/health`

**If edits are not applied:**
- Check backend logs: `/tmp/backend.log` or terminal running `npm run dev`
- Look for "[Code Mapper]" log messages
- Verify edit format matches VS Code TextEdit structure

**If backend returns errors:**
- Check OpenAI API key is configured in backend `.env` file
- Verify Vercel AI SDK packages are installed: `npm list ai @ai-sdk/openai`
- Check backend console for error details

### Success Criteria

✅ Backend endpoint responds successfully
✅ Extension compiles without errors
✅ File editing works without GitHub Copilot authentication
✅ No 401 errors when using edit tools
✅ Logs show Patent AI Code Mapper is being used

---

## Technical Details

### Backend Implementation
- **File:** `/Users/neoak/projects/patnet-ai-backend/src/routes/code-mapper.ts`
- **Endpoint:** `POST /v1/code-mapper`
- **Model:** GPT-4O via Vercel AI SDK
- **Output:** Type-safe JSON with Zod validation

### Extension Implementation
- **File:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/prompts/node/codeMapper/patentAICodeMapper.ts`
- **Integration:** `/Users/neoak/projects/vscode-copilot-chat/src/extension/prompts/node/codeMapper/codeMapperService.ts`
- **Trigger:** `process.env.PATENT_AI_MODE === 'true'`

### Edit Format
```typescript
{
  range: {
    start: { line: number, character: number },  // 0-indexed
    end: { line: number, character: number }      // 0-indexed
  },
  newText: string
}
```
