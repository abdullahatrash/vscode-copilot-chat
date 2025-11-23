# FlowLeap Patent IDE Migration Checklist

Use this checklist to track your conversion progress.

---

## Pre-Migration

- [ ] Read [FLOWLEAP_CONVERSION_GUIDE.md](./FLOWLEAP_CONVERSION_GUIDE.md)
- [ ] Read [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md)
- [ ] Read [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

**Backend Options** (choose one for testing):
- [ ] **Option A**: Use mock backend (included in `mock-backend/server.js`)
- [ ] **Option B**: Use OpenAI API directly (just need API key)
- [ ] **Option C**: Use your own backend (if already built)

You can test the extension conversion **without building your backend first**!

---

## Phase 1: Automated Setup

- [ ] Run conversion script: `bash scripts/convert-to-flowleap.sh`
- [ ] Verify files created:
  - [ ] `src/extension/byok/node/flowleapEndpoint.ts`
  - [ ] `src/extension/tools/node/patent/patentSearchTool.ts`
  - [ ] `src/extension/tools/node/patent/patentAnalysisTool.ts`
  - [ ] `.vscode/settings.example.json`
  - [ ] `CONVERSION_STATUS.md`
- [ ] Backup created: `package.json.backup`

---

## Phase 2: Manual Configuration

### 2.1: Update package.json Metadata

- [ ] Change `"name"` to `"flowleap-patent-ide"`
- [ ] Change `"displayName"` to `"FlowLeap Patent IDE"`
- [ ] Change `"description"` to describe patent IDE
- [ ] Change `"publisher"` to your publisher name
- [ ] Update `"repository"` URLs
- [ ] Update `"homepage"` and `"bugs"` URLs
- [ ] Add custom icon path (optional)

### 2.2: Add Configuration Properties

- [ ] Add `flowleap.apiUrl` property
- [ ] Add `flowleap.apiKey` property
- [ ] Add `flowleap.enabled` property
- [ ] Add other FlowLeap-specific settings

### 2.3: Update Activation Events

- [ ] Keep `onLanguageModelAccess:copilot`
- [ ] Remove GitHub-specific activation events (optional)
- [ ] Add custom activation events (optional)

### 2.4: Clean Up Contributions (Optional - can do later)

- [ ] Remove/comment GitHub PR review participant
- [ ] Remove/comment GitHub CLI participant
- [ ] Remove/comment Claude Code CLI session
- [ ] Remove/comment GitHub-specific tools
- [ ] Keep core tools (readFile, listDirectory, etc.)

---

## Phase 3: Code Changes - Bypass GitHub Auth

### 3.1: Modify languageModelAccess.ts

- [ ] Open `src/extension/conversation/vscode-node/languageModelAccess.ts`
- [ ] Import `FlowLeapEndpoint` at top of file
- [ ] Find token validation in `CopilotLanguageModelWrapper.provideLanguageModelResponse`
- [ ] Add check: `if (endpoint instanceof FlowLeapEndpoint)` bypass token
- [ ] Save file

### 3.2: Modify authenticationService.ts (Optional)

- [ ] Open `src/platform/authentication/node/authenticationService.ts`
- [ ] Find `getCopilotToken` method
- [ ] Add FlowLeap bypass logic
- [ ] Save file

---

## Phase 4: Register FlowLeap Provider

### 4.1: Create FlowLeapProvider.ts

- [ ] Create `src/extension/byok/vscode-node/flowleapProvider.ts`
- [ ] Extend `ByokChatModelProvider` or implement from scratch
- [ ] Implement `createEndpoint()` method
- [ ] Implement `getAvailableModels()` method
- [ ] Export `FlowLeapProvider` class

### 4.2: Register in Extension Activation

- [ ] Find extension activation function (likely `src/extension.ts`)
- [ ] Import `FlowLeapEndpoint` or `FlowLeapProvider`
- [ ] Create FlowLeap endpoint/provider instance
- [ ] Call `vscode.lm.registerChatModelProvider()` with:
  - Vendor: `'copilot'` (or custom)
  - Model ID: `'flowleap-patent-gpt'`
  - Provider instance
- [ ] Add to `context.subscriptions`

---

## Phase 5: Test Basic Connectivity

### 5.1: Prepare Backend

- [ ] Backend running on `http://localhost:8000`
- [ ] Test manually: `curl -X POST http://localhost:8000/v1/chat/completions`
- [ ] Verify response format matches OpenAI spec

### 5.2: Create VS Code Settings

- [ ] Create `.vscode/settings.json` if not exists
- [ ] Add `flowleap.apiUrl` setting
- [ ] Add `flowleap.apiKey` setting (if needed)
- [ ] Add `flowleap.enabled: true`

### 5.3: Build Extension

- [ ] Run `npm install` to ensure dependencies
- [ ] Run `npm run compile` to build TypeScript
- [ ] Fix any TypeScript errors

### 5.4: Launch in Debug Mode

- [ ] Press F5 in VS Code
- [ ] Extension Development Host window opens
- [ ] Check "Output" panel for errors
- [ ] Check "Help > Toggle Developer Tools" console

### 5.5: Test Chat

- [ ] Open chat panel (Cmd/Ctrl+Shift+P → "Chat: Open Chat")
- [ ] Select `flowleap-patent-gpt` model
- [ ] Send test message: "Hello!"
- [ ] Verify response appears
- [ ] Check backend logs for incoming request

### 5.6: Verify No GitHub Dependency

- [ ] Sign out of GitHub in Extension Development Host
- [ ] Close and reopen chat
- [ ] Send another message
- [ ] Should still work without GitHub authentication

---

## Phase 6: Customize Agent Identity

### 6.1: Update System Prompt

- [ ] Open `src/extension/prompts/node/agent/defaultAgentPrompt.ts`
- [ ] Find identity/system message construction
- [ ] Replace "GitHub Copilot" with "FlowLeap Patent IDE"
- [ ] Add patent-specific instructions
- [ ] Add tool usage guidelines

### 6.2: Update Model-Specific Prompts (Optional)

- [ ] Check for model-specific prompt files
- [ ] Update Claude prompt (if using Claude backend)
- [ ] Update GPT-4 prompt (if using OpenAI backend)

---

## Phase 7: Add Patent Tools

### 7.1: Implement Patent Search Tool

- [ ] Tool already created by script: `patentSearchTool.ts`
- [ ] Update backend URL if needed
- [ ] Update input schema if needed
- [ ] Test invoke method manually

### 7.2: Implement Patent Analysis Tool

- [ ] Tool already created by script: `patentAnalysisTool.ts`
- [ ] Update backend URL if needed
- [ ] Update analysis types if needed
- [ ] Test invoke method manually

### 7.3: Register Tools

- [ ] Open `src/extension/tools/node/toolRegistry.ts`
- [ ] Import `PatentSearchTool` and `PatentAnalysisTool`
- [ ] Find tool registration section
- [ ] Add `registerTool(new PatentSearchTool())`
- [ ] Add `registerTool(new PatentAnalysisTool())`

### 7.4: Add Tool Schemas to package.json

- [ ] Open `package.json`
- [ ] Find `contributes.languageModelTools`
- [ ] Add `patent_search` tool schema
- [ ] Add `analyze_patent` tool schema

### 7.5: Test Tool Invocation

- [ ] Rebuild and launch extension
- [ ] Send message that should trigger tool
  - Example: "Search for patents about neural networks"
- [ ] Verify tool is called (check logs)
- [ ] Verify tool result is processed
- [ ] Verify agent uses tool result in response

---

## Phase 8: Testing

### 8.1: Basic Chat Tests

- [ ] Simple chat message
- [ ] Multi-turn conversation
- [ ] Code snippet in message
- [ ] File reference in message

### 8.2: Tool Tests

- [ ] Patent search tool
- [ ] Patent analysis tool
- [ ] Core tools (readFile, listDirectory)
- [ ] Tool error handling

### 8.3: Streaming Tests

- [ ] Long response streams correctly
- [ ] Can cancel streaming response
- [ ] Streaming tool calls work

### 8.4: Edge Cases

- [ ] Empty message
- [ ] Very long message (>100k tokens)
- [ ] Message with images (if vision enabled)
- [ ] Rapid successive messages
- [ ] Backend offline (graceful error)
- [ ] Invalid tool call arguments

---

## Phase 9: Remove Unwanted Features

### 9.1: Remove GitHub Participants

- [ ] Open `src/extension/chat/vscode-node/participantRegistration.ts`
- [ ] Comment out or remove:
  - [ ] PR review participant
  - [ ] GitHub CLI participant
  - [ ] GitHub issue participant
- [ ] Keep workspace participant (if desired)
- [ ] Keep edit participant (if desired)

### 9.2: Remove GitHub Tools

- [ ] Open `src/extension/tools/node/toolRegistry.ts`
- [ ] Remove GitHub PR tool
- [ ] Remove GitHub issue tool
- [ ] Remove GitHub CLI tool
- [ ] Remove GitHub repo search tool

### 9.3: Remove GitHub Tool Schemas

- [ ] Open `package.json`
- [ ] Find `contributes.languageModelTools`
- [ ] Remove GitHub-specific tool schemas

### 9.4: Remove Claude Code CLI (Optional)

- [ ] Find CLI-related files in `src/extension/cli/`
- [ ] Remove or comment out CLI registration
- [ ] Remove CLI tool schemas from package.json

---

## Phase 10: Polish

### 10.1: Update Documentation

- [ ] Create README.md for FlowLeap
- [ ] Document configuration options
- [ ] Document available tools
- [ ] Add usage examples
- [ ] Add troubleshooting section

### 10.2: Update Icon and Branding

- [ ] Create extension icon (128x128 PNG)
- [ ] Add icon to `assets/` folder
- [ ] Update `icon` field in package.json
- [ ] Create marketplace banner (optional)

### 10.3: Add Telemetry (Optional)

- [ ] Decide on telemetry provider
- [ ] Update telemetry service
- [ ] Add opt-out setting
- [ ] Document data collection

### 10.4: Error Handling

- [ ] Add user-friendly error messages
- [ ] Handle backend offline gracefully
- [ ] Handle tool errors gracefully
- [ ] Add retry logic for transient failures

### 10.5: Performance

- [ ] Test with large codebases
- [ ] Optimize token counting
- [ ] Add request caching (if applicable)
- [ ] Test memory usage

---

## Phase 11: Package and Distribute

### 11.1: Prepare for Packaging

- [ ] Update version number in package.json
- [ ] Update changelog (create CHANGELOG.md)
- [ ] Run final tests
- [ ] Fix all linting errors
- [ ] Remove debug logging

### 11.2: Package Extension

- [ ] Install vsce: `npm install -g vsce`
- [ ] Run `vsce package`
- [ ] Verify .vsix file created
- [ ] Test installation: `code --install-extension flowleap-patent-ide-0.1.0.vsix`

### 11.3: Distribution Options

**Option A: Private Distribution**
- [ ] Share .vsix file with team
- [ ] Create installation instructions
- [ ] Set up update mechanism

**Option B: Marketplace Publishing**
- [ ] Create Azure DevOps account
- [ ] Create Personal Access Token
- [ ] Run `vsce publish`
- [ ] Create marketplace listing
- [ ] Add screenshots and documentation

**Option C: Private Registry**
- [ ] Set up private extension registry
- [ ] Configure VS Code to use private registry
- [ ] Publish to private registry

---

## Phase 12: Cleanup (Optional)

### 12.1: Remove Dead Code

- [ ] Delete `src/extension/github/` directory
- [ ] Delete `src/extension/cli/` directory
- [ ] Remove unused authentication code
- [ ] Remove CAPI client dependencies

### 12.2: Remove Dependencies

- [ ] Remove `@vscode/copilot-api` from package.json
- [ ] Remove other GitHub-specific packages
- [ ] Run `npm install` to clean up node_modules

### 12.3: Update Tests

- [ ] Remove GitHub-specific tests
- [ ] Add FlowLeap-specific tests
- [ ] Update test fixtures
- [ ] Ensure all tests pass

---

## Validation Checklist

Before considering migration complete:

### Functionality
- [ ] Chat works without GitHub login
- [ ] Messages sent to your backend
- [ ] Responses displayed correctly
- [ ] Tool calls work end-to-end
- [ ] Multi-turn conversations work
- [ ] Streaming works
- [ ] Core file tools work (readFile, etc.)
- [ ] Patent tools work (search, analysis)

### User Experience
- [ ] Extension name and description updated
- [ ] Custom icon displays
- [ ] Error messages are user-friendly
- [ ] No GitHub branding visible
- [ ] Chat UI is clean and functional

### Code Quality
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Code is documented
- [ ] No unused imports
- [ ] No console.log statements (use proper logging)

### Testing
- [ ] All automated tests pass
- [ ] Manual testing complete
- [ ] Edge cases handled
- [ ] Performance acceptable

### Documentation
- [ ] README.md exists and is accurate
- [ ] Configuration documented
- [ ] Tools documented
- [ ] Troubleshooting guide exists

---

## Rollback Plan

If something goes wrong:

1. **Restore package.json**
   ```bash
   mv package.json.backup package.json
   ```

2. **Revert code changes**
   ```bash
   git checkout .
   ```

3. **Revert specific file**
   ```bash
   git checkout src/extension/conversation/vscode-node/languageModelAccess.ts
   ```

4. **Clean build artifacts**
   ```bash
   npm run clean
   rm -rf out/
   npm run compile
   ```

---

## Success Criteria

Migration is successful when:

1. ✅ Extension activates without GitHub authentication
2. ✅ All chat messages go to `http://localhost:8000`
3. ✅ Responses display correctly in chat UI
4. ✅ Tool calls invoke your backend API
5. ✅ Patent tools return results
6. ✅ No GitHub dependencies remain
7. ✅ Extension is rebranded as "FlowLeap Patent IDE"
8. ✅ Ready to distribute to users

---

## Timeline Estimate

- **Phase 1-2**: 1-2 hours (automated + basic config)
- **Phase 3-5**: 2-4 hours (code changes + testing)
- **Phase 6-7**: 2-4 hours (prompts + tools)
- **Phase 8**: 2-4 hours (comprehensive testing)
- **Phase 9-10**: 2-4 hours (cleanup + polish)
- **Phase 11**: 1-2 hours (packaging)
- **Phase 12**: 2-4 hours (cleanup - optional)

**Total**: ~12-24 hours for full migration

**Quick PoC**: Phases 1-5 only = ~4-8 hours

---

## Getting Help

- **Documentation**: See all `*.md` files in project root
- **VS Code API**: https://code.visualstudio.com/api
- **Language Model API**: https://code.visualstudio.com/api/extension-guides/language-model
- **OpenAI API Spec**: https://platform.openai.com/docs/api-reference/chat

---

## Notes

Track your progress by checking off items as you complete them. If you get stuck on a phase, refer back to the detailed guides:

- **FLOWLEAP_CONVERSION_GUIDE.md**: Detailed step-by-step instructions
- **ARCHITECTURE_COMPARISON.md**: Visual diagrams and comparisons
- **QUICK_REFERENCE.md**: Quick lookup for specific files/lines
- **CONVERSION_STATUS.md**: Auto-generated status after running script

Good luck with your migration! 🚀
