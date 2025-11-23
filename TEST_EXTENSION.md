# Testing vscode-copilot-chat Extension

## Current Status
✅ Watch mode is running (`npm run watch`)
✅ Extension compiled successfully (0 errors)
✅ dist/extension.js exists

## How to Launch Extension (F5)

### Option 1: Using Run & Debug Panel

1. **Open the vscode-copilot-chat project in VS Code**
   ```bash
   cd /Users/neoak/projects/vscode-copilot-chat
   code .
   ```

2. **Open Run and Debug:**
   - Click the "Run and Debug" icon in the left sidebar (play button with bug)
   - Or press `Cmd+Shift+D`

3. **Select the launch configuration:**
   - At the TOP of the Run and Debug panel, there's a dropdown
   - Click it and select: **"Launch Copilot Extension"**
   - (NOT "Watch Mode" - you already have watch running in terminal)

4. **Start debugging:**
   - Press `F5` OR click the green ▶️ play button next to the dropdown

### Option 2: Using Command Palette

1. Press `Cmd+Shift+P`
2. Type: `Debug: Select and Start Debugging`
3. Choose: **"Launch Copilot Extension"**

## What Should Happen

When successfully launched:

```
┌─────────────────────────────────────────────────────────┐
│  Original VS Code Window (Your Code)                    │
│  - Shows Debug Console with extension logs              │
│  - Debug toolbar appears at top                         │
│  - You can set breakpoints here                         │
└─────────────────────────────────────────────────────────┘

                        ↓ Launches ↓

┌─────────────────────────────────────────────────────────┐
│  Extension Development Host (New Window)                │
│  - Fresh VS Code instance with your extension loaded    │
│  - Title bar says "[Extension Development Host]"        │
│  - This is where you test the extension                 │
└─────────────────────────────────────────────────────────┘
```

## Testing the Extension

Once the Extension Development Host window opens:

### Step 1: Open Chat Panel

1. Press `Cmd+Shift+I` or click the chat icon in the sidebar
2. Or use Command Palette: `Chat: Focus on Chat View`

### Step 2: Check if Patent AI Provider is Loaded

Look in the **Output panel** (in the Extension Development Host window):

1. Press `Cmd+Shift+U` to open Output panel
2. Select **"GitHub Copilot"** or **"Extension Host"** from dropdown
3. Look for logs like:
   ```
   [Patent AI] Endpoint provider initialized
   [Patent AI] Backend URL: http://localhost:8000/v1/chat/completions
   [Patent AI] API Key: test****key
   ```

### Step 3: Send a Test Message

In the chat panel, type:
```
Hello, can you help me search for prior art?
```

### Step 4: Check Logs

**In Extension Development Host:**
- Output panel should show: `[Patent AI] Making chat request to backend`

**In Your Backend Terminal:**
```bash
cd /Users/neoak/projects/patnet-ai-backend
npm run dev
```

You should see:
```
[2025-01-23T...] POST /v1/chat/completions
[Patent AI] Chat request from VSCode: { model: 'gpt-4o', messageCount: 1, ... }
```

## Troubleshooting

### Issue 1: F5 Does Nothing

**Solution:**
1. Make sure you're in the vscode-copilot-chat project folder
2. Open Run & Debug panel (`Cmd+Shift+D`)
3. Check the dropdown shows a configuration name
4. If dropdown is empty, your launch.json might not be loaded
5. Try reloading VS Code: `Cmd+Shift+P` → "Developer: Reload Window"

### Issue 2: "Cannot find runtime"

**Solution:**
The launch config looks for `${execPath}` which is the current VS Code executable.
If this fails, try the alternative config: **"Launch Copilot Extension - Watch Mode - Code OSS"**
This one uses your FlowLeap IDE at `../vscode/scripts/code.sh`

### Issue 3: Extension Doesn't Activate

**Check package.json activation events:**
```bash
cd /Users/neoak/projects/vscode-copilot-chat
cat package.json | grep -A 5 "activationEvents"
```

The extension should activate on startup or when chat is opened.

### Issue 4: "No default agent contributed" Error

This means the Patent AI provider isn't registering correctly. Check:

1. **Is PatentEndpointProvider registered in contributions?**
   - File: `src/extension/byok/vscode-node/contributions.ts` (or similar)
   - Should register PatentEndpointProvider as a language model provider

2. **Check environment variables:**
   ```bash
   # In Extension Development Host, open Debug Console and type:
   process.env.PATENT_AI_MODE
   process.env.PATENT_API_KEY
   ```

## Alternative: Test with Code OSS (FlowLeap IDE)

If you want to test in your FlowLeap IDE fork instead:

1. **Select this launch config:**
   - "Launch Copilot Extension - Watch Mode - Code OSS"

2. **This will:**
   - Launch your FlowLeap IDE from `../vscode/scripts/code.sh`
   - Load the extension into it
   - Attach debugger on port 5870

3. **Requirements:**
   - FlowLeap IDE must be built: `cd ../vscode && npm run watch`
   - Extension must be in watch mode (already running ✅)

## Checking Extension is Active

Once Extension Development Host launches, check if extension is active:

1. **Command Palette** (`Cmd+Shift+P`)
2. Type: `Developer: Show Running Extensions`
3. Look for:
   - `GitHub.copilot-chat` or `copilot-chat`
   - Status should be "Activated"

## Next Steps After Successful Launch

If extension loads successfully but chat doesn't work:

1. **Backend must be running:**
   ```bash
   cd /Users/neoak/projects/patnet-ai-backend
   npm run dev
   ```

2. **Check backend logs** for incoming requests

3. **Check extension logs** in Output panel

4. **Check Debug Console** in original VS Code window for errors

---

## Quick Launch Checklist

- [ ] Backend is running (`npm run dev` in patnet-ai-backend)
- [ ] Watch mode is running (`npm run watch` in vscode-copilot-chat) ✅
- [ ] VS Code is open in vscode-copilot-chat folder
- [ ] Run & Debug panel is open (`Cmd+Shift+D`)
- [ ] "Launch Copilot Extension" is selected in dropdown
- [ ] Press F5
- [ ] Extension Development Host window opens
- [ ] Chat panel is accessible (`Cmd+Shift+I`)

---

Let me know if F5 still doesn't work or if you see any error messages!
