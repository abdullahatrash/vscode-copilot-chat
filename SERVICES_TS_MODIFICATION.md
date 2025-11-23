# services.ts Modification

> Exact code to add to `src/extension/extension/vscode-node/services.ts`

---

## Step 1: Add Import

**Location**: Top of file, around line 7-12 (with other authentication imports)

**Add this line**:
```typescript
import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';
```

**Context** (what it should look like):
```typescript
import { ExtensionContext, ExtensionMode, env } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { StaticGitHubAuthenticationService } from '../../../platform/authentication/common/staticGitHubAuthenticationService';
import { createStaticGitHubTokenProvider, getOrCreateTestingCopilotTokenManager } from '../../../platform/authentication/node/copilotTokenManager';
import { AuthenticationService } from '../../../platform/authentication/vscode-node/authenticationService';
import { VSCodeCopilotTokenManager } from '../../../platform/authentication/vscode-node/copilotTokenManager';
import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';  // <-- ADD THIS
```

---

## Step 2: Replace Authentication Registration

**Location**: Around line 154-162

**Find this code**:
```typescript
if (isScenarioAutomation) {
    builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
    builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
} else {
    builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
}
```

**Replace with this code**:
```typescript
// Check if Patent AI mode is enabled
const isPatentMode = process.env.PATENT_AI_MODE === 'true' ||
                     extensionContext.globalState.get<boolean>('patent.enabled', false);

if (isPatentMode) {
    // Patent AI mode - use mock authentication and custom backend
    builder.define(IAuthenticationService, new SyncDescriptor(PatentAuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
    logService.info('[Patent AI] 🎯 Patent AI mode enabled - using custom authentication');
} else if (isScenarioAutomation) {
    // Scenario automation mode
    builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
    builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
} else {
    // Standard GitHub Copilot authentication
    builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
    builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
}
```

---

## Complete Diff

```diff
--- a/src/extension/extension/vscode-node/services.ts
+++ b/src/extension/extension/vscode-node/services.ts
@@ -10,6 +10,7 @@ import { createStaticGitHubTokenProvider, getOrCreateTestingCopilotTokenManager
 import { AuthenticationService } from '../../../platform/authentication/vscode-node/authenticationService';
 import { VSCodeCopilotTokenManager } from '../../../platform/authentication/vscode-node/copilotTokenManager';
+import { PatentAuthenticationService } from '../../byok/node/patentAuthenticationService';
 import { IChatAgentService } from '../../../platform/chat/common/chatAgents';
 import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';

@@ -152,11 +153,20 @@ export function setupServices(builder: IInstantiationServiceBuilder, extension
        builder.define(ICopilotTokenManager, new SyncDescriptor(VSCodeCopilotTokenManager));
    }

+   // Check if Patent AI mode is enabled
+   const isPatentMode = process.env.PATENT_AI_MODE === 'true' ||
+                        extensionContext.globalState.get<boolean>('patent.enabled', false);
+
+   if (isPatentMode) {
+       // Patent AI mode - use mock authentication and custom backend
+       builder.define(IAuthenticationService, new SyncDescriptor(PatentAuthenticationService));
+       builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
+       builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
+       logService.info('[Patent AI] 🎯 Patent AI mode enabled - using custom authentication');
+   } else if (isScenarioAutomation) {
+       // Scenario automation mode
        builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
        builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl, [collectFetcherTelemetry]));
        builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
    } else {
+       // Standard GitHub Copilot authentication
        builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
        builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider, [collectFetcherTelemetry]));
```

---

## What This Does

1. **Adds import** for `PatentAuthenticationService`
2. **Checks for Patent mode** via environment variable or config
3. **Uses Patent authentication** when enabled
4. **Keeps existing behavior** when disabled
5. **Logs clearly** so you know which mode is active

---

## Lines Changed

- **+1 line**: Import statement
- **+13 lines**: Patent mode check and registration
- **Total**: 14 lines added

---

## Verification

After making these changes and building, you should see in the logs:

```
[Patent AI] 🎯 Patent AI mode enabled - using custom authentication
```

If you don't see this, Patent mode is not enabled. Check:
1. `PATENT_AI_MODE=true` environment variable OR
2. `"patent.enabled": true` in settings

---

## Testing

```bash
# 1. Make the changes above
# 2. Rebuild
npm run watch

# 3. Launch Extension Development Host
# Press F5

# 4. Check Output panel
# CMD+Shift+P → "Developer: Show Logs" → "Extension Host"

# Should see:
# [Patent AI] 🎯 Patent AI mode enabled - using custom authentication
# [Patent AI] ✅ Mock authentication active
# [Patent AI] ✅ API key configured: pk_t***def
```

---

That's it! Just these two changes and you're ready to go! 🚀
