# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Be extremely concise. Sacrifice grammar for concision in interactions and commit messages.

At end of each plan, list unresolved questions (if any). Keep questions extremely concise.

## Project Overview

**Patent AI IDE** - A customized fork of VS Code Copilot Chat that bypasses GitHub authentication to use a custom Patent AI backend instead.

### What We're Building
- Replace GitHub Copilot auth with mock auth (no GitHub account needed)
- Route all LLM requests to custom Patent AI backend at `localhost:8000`
- Keep full VS Code Copilot Chat UI and 70+ built-in tools
- Enable patent search and analysis via custom tools

### Key Customizations
- **`src/extension/byok/node/patentAuthenticationService.ts`** - Mock auth bypassing GitHub
- **`src/extension/byok/node/patentChatEndpoint.ts`** - Custom endpoint to Patent AI backend
- **`src/extension/byok/vscode-node/patentEndpointProvider.ts`** - Endpoint provider for Patent AI
- **`src/extension/prompts/node/codeMapper/patentAICodeMapper.ts`** - Code mapper using Patent AI backend
- **`src/extension/tools/vscode-node/searchPatentsTool.ts`** - Patent search tool

### Patent AI Mode
Enable via env var or setting:
```bash
PATENT_AI_MODE=true  # in launch.json or environment
```
Or in `.vscode/settings.json`:
```json
{ "patent.enabled": true, "patent.apiKey": "your-key" }
```

### Backend
Patent AI backend at `/Users/neoak/projects/patnet-ai-backend/` provides:
- `POST /v1/chat/completions` - OpenAI-compatible chat endpoint
- `POST /v1/code-mapper` - Code mapping for file edits
- `POST /v1/patent-search` - Patent search via EPO OPS API

Docs: `docs/patent-ai/` - Full integration guides

## Adding New Tools

**CRITICAL**: When adding new tools for Patent AI, follow `docs/patent-ai/ADDING_NEW_TOOLS.md`

Quick checklist:
1. Add to `ToolName` and `ContributedToolName` enums in `src/extension/tools/common/toolNames.ts`
2. Add to `toolCategories` in same file
3. Register in `package.json` under `contributes.languageModelTools` with good `modelDescription`
4. Create tool in `src/extension/tools/vscode-node/` (thin client calling backend)
5. Import in `src/extension/tools/vscode-node/allTools.ts`
6. **Enable in `src/extension/intents/node/agentIntent.ts`** - add to `allowTools` in Patent AI mode block
7. Create backend endpoint in `/Users/neoak/projects/patnet-ai-backend/src/routes/`
8. Register route in backend `server.ts`

**Step 6 is most commonly missed!** Without it, tool won't be available to LLM.

## Essential Commands

### Build & Development
```bash
npm run build          # Production build
npm run compile        # Development build
npm run watch          # All watch modes in parallel (recommended for development)
npm run typecheck      # Strict TypeScript type checking
```

### Testing
```bash
npm run test:unit              # Vitest unit tests
npm run test:extension         # VS Code integration tests
npm run simulate               # LLM-based scenario tests
npm run simulate-require-cache # Simulation tests with cache
npm run vitest -- path/to/file # Run specific unit test file
```

### Linting & Formatting
```bash
npm run lint           # ESLint (zero warnings policy)
npm run prettier       # Code formatting
npm run tsfmt          # TypeScript formatting
```

### Important Development Note
**ALWAYS** check the `watch` task output for compilation errors before running any script or declaring work complete. The `compile` task alone is insufficient for verifying correctness.

## Architecture

### Directory Structure
- **`src/extension/`**: Feature-organized extension implementation (~47 directories)
- **`src/platform/`**: Shared platform services (search, embeddings, parsing, telemetry)
- **`src/util/`**: Infrastructure, VS Code API abstractions, and service framework
- **`src/util/vs/`**: Utilities borrowed from microsoft/vscode (read-only)

### Core Architectural Patterns

**Service-Oriented Architecture**: Dependency injection via `IInstantiationService`. Always use services instead of direct node/vscode APIs (e.g., use `IFileService` not node's `fs`).

**Contribution System**: Features register themselves as modular contributions during extension activation.

**Runtime Layers**: Code is organized by runtime environment - Common, Vscode, Node, Vscode-Node, Worker.

**TSX-Based Prompts**: Prompts use `@vscode/prompt-tsx` with custom JSX factory `vscpp` and priority-based token budgeting.

**Tools System**: Tools registered via VS Code Language Model Tool API with extended `ICopilotTool` interface.

### Main Entry Point
`src/extension/extension/vscode-node/extension.ts`

### Key Feature Directories
- `conversation/` - Chat participants, agents, conversation orchestration
- `inlineChat/`, `inlineEdits/` - Inline editing (Ctrl+I)
- `tools/` - Language model tools
- `prompts/` - TSX prompt components
- `context/` - Context resolution for code understanding
- `endpoint/` - AI service endpoints and model selection
- `byok/` - Bring Your Own Key functionality

## Coding Standards

### TypeScript
- **Indentation**: Tabs (not spaces)
- **Naming**: `PascalCase` for types/enums, `camelCase` for functions/variables
- **Strings**: Double quotes for user-visible (localized) strings, single quotes for internal
- **Functions**: Prefer arrow functions `=>` over anonymous function expressions
- **Types**: Avoid `any` unless absolutely necessary; use `readonly` when possible; avoid casts
- **URIs**: Always use URI type instead of string file paths

### Code Style
```typescript
// Arrow function parameters - omit parens for single param
x => x + x                    // correct
(x, y) => x + y               // correct (multiple params)
(x) => x + x                  // wrong

// Always use curly braces, open brace on same line
for (let i = 0; i < 10; i++) {
    if (x < 10) {
        foo();
    }
}
```

### React/JSX
- Custom JSX factory: `vscpp` (not React.createElement)
- Fragment factory: `vscppf`

## Testing

- **Unit Tests**: Vitest in `**/test/**/*.test.ts` files
- **Integration Tests**: VS Code extension host tests via `@vscode/test-cli`
- **Simulation Tests**: End-to-end scenario tests in `*.stest.ts` files with LLM-based verification

## Requirements

- Node.js >= 22.14.0
- npm >= 9.0.0
- VS Code ^1.107.0
- Python >= 3.10, <= 3.12 (for notebooks/ML scripts)

## Reference

For comprehensive coding guidelines, architecture details, and best practices, see `.github/copilot-instructions.md`.
