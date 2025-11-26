# Extension Activation Debugging Guide

## Current Status
Extension Development Host launched, but extension not showing in Running Extensions.

## Diagnostic Steps

### 1. Check Debug Console (Original VS Code Window)

**Location:** Original VS Code window → Bottom panel → "Debug Console" tab

**Look for these messages:**

```
[Patent AI Services] Checking Patent AI mode: { envVar: 'true', globalState: false, isPatentMode: true }
[Patent AI Services] ✅ Patent AI mode ENABLED - registering PatentAuthenticationService and PatentEndpointProvider
```

**If you see:**
- ✅ "Patent AI mode ENABLED" → Patent services registered correctly
- ❌ "Using standard GitHub Copilot authentication" → Environment variable not detected

### 2. Check Extension Host Output (Extension Development Host Window)

**Location:** Extension Development Host → Press `Cmd+Shift+U` → Select "Extension Host" from dropdown

**Look for these messages:**

```
[Patent AI] 🎯 Patent AI backend integration ENABLED
[Patent AI] ✅ API key configured: test****-key
[Patent AI] 🌐 Backend URL: http://localhost:8000/v1/chat/completions
[Patent AI] ✅ Mock authentication active
```

**If missing:** Extension didn't activate or PatentContribution didn't initialize

### 3. Check Running Extensions

**Location:** Extension Development Host → `Cmd+Shift+P` → "Developer: Show Running Extensions"

**Expected:**
- Extension: `GitHub.copilot-chat`
- Display Name: `GitHub Copilot Chat`
- Status: `Activated`

**If missing:**
- Extension failed to activate
- Check for activation errors in Debug Console

### 4. Check for Activation Errors

**Location:** Original VS Code window → Debug Console

**Look for:**
- Red error messages
- Stack traces
- "Failed to activate extension" messages

### 5. Force Extension Activation (if not activated)

**In Extension Development Host:**
1. Open any folder (`File → Open Folder`)
2. Create a new file (`Cmd+N`)
3. Try to open chat panel (`Cmd+Shift+I`)
4. Or try Command Palette: `Chat: Focus on Chat View`

This might trigger the activation events:
- `onStartupFinished` - already triggered
- `onLanguageModelChat:copilot` - triggered when chat is opened

## Common Issues

### Issue 1: Environment Variables Not Set
**Symptom:** Logs show "Using standard GitHub Copilot authentication"
**Fix:** Verify launch.json has:
```json
"env": {
    "PATENT_AI_MODE": "true",
    "PATENT_API_KEY": "test-api-key"
}
```

### Issue 2: Extension Not Loading
**Symptom:** No logs, extension not in Running Extensions
**Fix:**
- Verify dist/extension.js exists: `ls -la dist/extension.js`
- Restart Extension Development Host (click restart button in debug toolbar)

### Issue 3: TypeScript Compilation Errors
**Symptom:** Extension compiles but doesn't work correctly
**Fix:** Check Terminal → "Problems" tab for TypeScript errors

### Issue 4: Authentication Blocking
**Symptom:** Extension loads but chat doesn't appear
**Fix:** Patent AI mode should bypass GitHub authentication
- Check if PatentAuthenticationService is registered
- Verify mock token is created

## Next Steps After Successful Activation

Once you see the extension in Running Extensions:

1. **Open Chat Panel:**
   - Press `Cmd+Shift+I`
   - Or Command Palette: `Chat: Focus on Chat View`

2. **Verify Patent AI Provider:**
   - Check Extension Host output for "[Patent AI]" logs
   - Look for model registration messages

3. **Test Backend Connection:**
   - Make sure backend is running: `cd /Users/neoak/projects/patnet-ai-backend && npm run dev`
   - Send a test message in chat
   - Watch backend terminal for incoming request

4. **Check Network Request:**
   - Extension should POST to `http://localhost:8000/v1/chat/completions`
   - Backend should log: `POST /v1/chat/completions`

## Debugging Commands

```bash
# In vscode-copilot-chat project
npm run watch                          # Keep this running
ls -la dist/extension.js              # Verify build output exists

# In patnet-ai-backend project
npm run dev                            # Start backend server
curl http://localhost:8000/v1/health  # Test backend is running
```

## Visual Debugging Flow

```
┌─────────────────────────────────────────────────┐
│  1. Press F5 in VS Code                         │
│  2. Select "Launch Copilot Extension"           │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  Extension Development Host Launches            │
│  - New window with "[Extension Development      │
│    Host]" in title bar                          │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  Check Debug Console (Original Window)          │
│  - Look for "[Patent AI Services]" logs         │
│  - Verify PATENT_AI_MODE detected               │
└─────────────┬───────────────────────────────────┘
              │
              ├─ ✅ Patent AI mode enabled
              │   │
              │   ▼
              │  ┌──────────────────────────────────┐
              │  │ Extension Activates              │
              │  │ - PatentAuthenticationService    │
              │  │ - PatentEndpointProvider         │
              │  │ - PatentContribution             │
              │  └──────────────────────────────────┘
              │
              └─ ❌ Standard GitHub auth
                  │
                  ▼
                 ┌──────────────────────────────────┐
                 │ Extension tries to use GitHub    │
                 │ - Will fail without GitHub auth  │
                 └──────────────────────────────────┘
```

## Expected Log Flow (Success Case)

**1. Debug Console (services.ts):**
```
[Patent AI Services] Checking Patent AI mode: {
  envVar: 'true',
  globalState: false,
  isPatentMode: true
}
[Patent AI Services] ✅ Patent AI mode ENABLED - registering PatentAuthenticationService and PatentEndpointProvider
```

**2. Extension Host Output (patentContribution.ts):**
```
[Patent AI] 🎯 Patent AI backend integration ENABLED
[Patent AI] ✅ API key configured: test****-key
[Patent AI] 🌐 Backend URL: http://localhost:8000/v1/chat/completions
[Patent AI] ✅ Mock authentication active
[Patent AI] User: patent-examiner
[Patent AI] SKU: patent_enterprise
[Patent AI] Chat enabled: true
[Patent AI] Quota exceeded: false
```

**3. Running Extensions:**
```
GitHub.copilot-chat
Status: Activated
```

---

**Current Task:** Check the Debug Console and Extension Host output for these messages, then report back what you see.
