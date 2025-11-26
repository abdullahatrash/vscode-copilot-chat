# System Prompt Architecture Analysis

> Deep dive into the VSCode Copilot Chat extension's dynamic system prompt architecture - TSX-based compositional system with model-specific optimizations.

---

## Table of Contents

- [Overview](#overview)
- [Architecture: Dynamic vs Static](#architecture-dynamic-vs-static)
- [Template System: TSX Components](#template-system-tsx-components)
- [Prompt Building Process](#prompt-building-process)
- [Variables & Context Injection](#variables--context-injection)
- [Prompt Components Hierarchy](#prompt-components-hierarchy)
- [Model-Specific Prompts](#model-specific-prompts)
- [Key Files Reference](#key-files-reference)
- [Application to Your Patent Agent](#application-to-your-patent-agent)

---

## Overview

The VSCode Copilot Chat extension uses a **sophisticated TSX-based compositional system** for building AI prompts. This is NOT a simple string template system - it's a **React-like component architecture** specifically designed for AI prompt engineering.

### Key Characteristics

- ✅ **100% Dynamic** - Generated at runtime based on context
- ✅ **TSX Components** - React-style JSX for composability
- ✅ **Model-Aware** - Different prompts per LLM (Claude, GPT, Gemini)
- ✅ **Token Budget Management** - Priority system with intelligent truncation
- ✅ **Service Integration** - Dependency injection for system access
- ✅ **Context-Rich** - Automatic workspace, git, terminal state inclusion
- ✅ **Cache-Optimized** - Prompt caching with strategic breakpoints

---

## Architecture: Dynamic vs Static

### Answer: **100% Dynamic and Context-Aware**

System prompts are **never fixed strings**. They are dynamically composed at runtime based on multiple factors:

### Dynamic Factors

| Factor | Impact | Example |
|--------|--------|---------|
| **Model Family** | Different prompts per model | Claude gets different instructions than GPT |
| **Available Tools** | Instructions adapt to enabled tools | If `applyPatch` available, add patch-specific instructions |
| **User Context** | Workspace structure, files, state | Multi-root workspace gets different structure hints |
| **Conversation History** | Previous turns and tool results | Tool results from previous iteration included |
| **Configuration** | User settings, custom instructions | `.copilot-instructions.md` files injected |
| **Cache Management** | Prompt caching breakpoints | Strategic cache boundaries for efficiency |
| **Current Editor State** | Active file, selection, cursor | Context about what user is viewing |
| **Git Repository** | Branch, changes, repo info | Current branch and uncommitted changes |
| **Terminal State** | Running processes, CWD | Terminal context for command suggestions |
| **Task State** | Active todos, test status | Whether tests are passing, tasks in progress |

### Code Example from `agentPrompt.tsx`

```tsx
export class AgentPrompt extends PromptElement<AgentPromptProps> {
    async render(state: void, sizing: PromptSizing) {
        // 1. Get model-specific instructions
        const instructions = await this.getInstructions();

        // 2. Build base prompt with conditional identity rules
        const baseAgentInstructions = <>
            <SystemMessage>
                You are an expert AI programming assistant, working with a user in the VS Code editor.<br />
                {isGpt5PlusFamily(this.props.endpoint.family) ? (
                    <><GPT5CopilotIdentityRule /><Gpt5SafetyRule /></>
                ) : (
                    <><CopilotIdentityRules /><SafetyRules /></>
                )}
            </SystemMessage>
            {instructions}
        </>;

        // 3. Compose full prompt with dynamic context
        return <>
            {baseAgentInstructions}
            {await this.getAgentCustomInstructions()}
            <UserMessage>
                {await this.getOrCreateGlobalAgentContext(this.props.endpoint)}
            </UserMessage>
            <SummarizedConversationHistory
                conversation={this.props.promptContext.conversation}
                endpoint={this.props.endpoint}
                chatVariables={this.props.promptContext.chatVariables}
                location={this.props.location}
            />
            <AgentUserMessage
                request={this.props.promptContext.query}
                toolReferences={this.props.promptContext.toolReferences}
                chatVariables={this.props.promptContext.chatVariables}
                endpoint={this.props.endpoint}
                location={this.props.location}
            />
            {this.props.promptContext.toolCallResult && (
                <ChatToolCallResult
                    result={this.props.promptContext.toolCallResult}
                    endpoint={this.props.endpoint}
                />
            )}
        </>;
    }
}
```

**Key Insight:** The entire prompt structure changes based on:
- Which model is being used
- What tools are available
- User's workspace state
- Conversation history
- Current context

---

## Template System: TSX Components

### Framework: `@vscode/prompt-tsx`

**YES! They use a specific library:**

**Library:** `@vscode/prompt-tsx` (v0.4.0-alpha.5)
- **GitHub:** https://github.com/microsoft/vscode-prompt-tsx
- **NPM:** https://www.npmjs.com/package/@vscode/prompt-tsx
- **Docs:** https://code.visualstudio.com/api/extension-guides/ai/prompt-tsx

The extension uses **Microsoft's official prompt-tsx library** - a **React-like JSX framework** specifically designed for building AI prompts with:
- Component composition
- Props passing
- Async rendering
- Token budget awareness
- Dependency injection
- Priority-based pruning
- Flexible token management (`flexGrow`, `flexBasis`, `flexReserve`)

### Installation

```bash
npm install --save @vscode/prompt-tsx
```

### TSX Configuration

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "vscpp",
    "jsxFragmentFactory": "vscppf"
  }
}
```

### Base Component Class (from @vscode/prompt-tsx)

```typescript
// From @vscode/prompt-tsx library
import { PromptElement, PromptSizing, PromptPiece } from '@vscode/prompt-tsx';

export abstract class PromptElement<Props = {}, State = void> {
    constructor(
        protected readonly props: Props,
        // Services injected via decorators
    ) {}

    abstract render(state: State, sizing: PromptSizing): PromptPiece;
}
```

### Main API: renderPrompt

```typescript
import { renderPrompt } from '@vscode/prompt-tsx';

const { messages } = await renderPrompt(
    PromptComponent,
    props,
    { modelMaxPromptTokens: 4096 },
    chatModel
);

// Returns: vscode.LanguageModelChatMessage[]
```

### Core TSX Elements (from @vscode/prompt-tsx)

#### 1. **Message Components**

```tsx
import { SystemMessage, UserMessage, AssistantMessage } from '@vscode/prompt-tsx';

<SystemMessage>
    {/* System-level instructions */}
</SystemMessage>

<UserMessage>
    {/* User queries and context */}
</UserMessage>

<AssistantMessage>
    {/* Previous assistant responses */}
</AssistantMessage>
```

#### 2. **Structure Components**

```tsx
import { TextChunk, Chunk, TokenLimit, Expandable } from '@vscode/prompt-tsx';

<Tag name='instructions'>
    {/* Wrapped in XML-like tags: <instructions>...</instructions> */}
</Tag>

<TextChunk priority={100} flexGrow={2}>
    {/* Token-aware content with sizing */}
    {/* Progressively includes text within token budgets */}
</TextChunk>

<Chunk priority={90}>
    {/* Groups elements for atomic inclusion/exclusion */}
    {/* Either fully included or fully excluded */}
</Chunk>

<TokenLimit limit={5000}>
    {/* Sets hard caps on token consumption */}
</TokenLimit>

<Expandable>
    {/* Fills remaining budget dynamically */}
</Expandable>

<KeepWith>
    {/* Keep content together, don't split */}
</KeepWith>
```

#### 3. **Context Components**

```tsx
<CurrentDatePrompt />
// Output: "The current date is November 20, 2025."

<UserOSPrompt />
// Output: "The user's current OS is: macOS"

<MultirootWorkspaceStructure maxSize={2000} excludeDotFiles={true} />
// Output: Directory tree of workspace

<RepoContext />
// Output: Git repository information

<CurrentEditorContext endpoint={endpoint} />
// Output: Active file, selection, cursor position
```

### Example: Tag Component Implementation

**File:** `src/extension/prompts/common/tag.tsx`

```tsx
export class Tag extends PromptElement<TagProps> {
    render() {
        const { name, children, attrs = {} } = this.props;

        // Convert attributes to string
        const attrStr = Object.entries(attrs)
            .map(([key, value]) => ` ${key}="${value}"`)
            .join('');

        return (
            <>
                <KeepWith>{`<${name}${attrStr}>\n`}</KeepWith>
                <TagInner>{children}<br /></TagInner>
                <KeepWith>{`</${name}>`}</KeepWith>
            </>
        );
    }
}

// Usage:
<Tag name='instructions' attrs={{ priority: 'high' }}>
    Follow these guidelines...
</Tag>

// Renders as:
// <instructions priority="high">
// Follow these guidelines...
// </instructions>
```

### Example: Conditional Rendering

```tsx
export class InstructionMessage extends PromptElement {
    constructor(
        props: any,
        @IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
    ) {
        super(props);
    }

    render(_state: void, sizing: PromptSizing): PromptPiece {
        // Different models prefer instructions in different message types
        return modelPrefersInstructionsInUserMessage(this.promptEndpoint.family)
            ? <UserMessage>{this.props.children}</UserMessage>
            : <SystemMessage>{this.props.children}</SystemMessage>;
    }
}
```

---

## Prompt Building Process

### Multi-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Model Detection                                          │
│    ├─> PromptRegistry.getPrompt(endpoint)                  │
│    └─> Returns model-specific prompt class                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Prompt Instantiation                                     │
│    ├─> Dependency Injection (services via constructor)     │
│    └─> Props passed with context, tools, history           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Component Rendering (Async)                              │
│    ├─> render() method called with PromptSizing            │
│    ├─> Async operations (file reads, service calls)        │
│    └─> Returns TSX structure                               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Token Budget Management                                  │
│    ├─> Priority system (0-100, higher = more important)    │
│    ├─> flexGrow for dynamic sizing                         │
│    └─> Intelligent truncation (least important first)      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Final Serialization                                      │
│    ├─> TSX → Raw chat messages                             │
│    ├─> System messages consolidated                        │
│    ├─> Cache breakpoints inserted                          │
│    └─> References extracted                                │
└─────────────────────────────────────────────────────────────┘
```

### Token Budget System

**File:** `src/extension/prompts/node/base/promptRenderer.ts`

```typescript
interface PromptSizing {
    tokenBudget: number;        // Total tokens available
    consumed: number;           // Tokens used so far
    flexBudget: number;         // Available for flex-grow items
}

interface ContentProps {
    priority?: number;          // 0-100, higher = more important
    flexGrow?: number;          // Relative sizing weight
    maxTokens?: number;         // Hard limit for this component
}
```

**Example Usage:**

```tsx
<TextChunk priority={Priority.High} flexGrow={2} maxTokens={5000}>
    <Tag name='workspaceInfo'>
        <MultirootWorkspaceStructure />
    </Tag>
</TextChunk>

<TextChunk priority={Priority.Medium} flexGrow={1}>
    <Tag name='terminalState'>
        <TerminalStatePromptElement />
    </Tag>
</TextChunk>
```

**Token Budget Algorithm:**

1. **Fixed Priority Items** - Allocated first (priority-based)
2. **Flex Growth Items** - Share remaining budget proportionally
3. **Truncation** - Lowest priority items truncated first
4. **Summarization** - Conversation history summarized if exceeds budget

### Rendering Pipeline Code

**File:** `src/extension/prompts/node/base/promptRenderer.ts`

```typescript
export class PromptRenderer<P extends BasePromptElementProps> {
    async render(
        progress: IChatResponseProgress,
        token: CancellationToken,
        options: RenderPromptOptions
    ): Promise<RenderPromptResult> {
        const result = await super.render(progress, token);

        // 1. Collapse consecutive system messages
        for (let i = 1; i < result.messages.length; i++) {
            const current = result.messages[i];
            const prev = result.messages[i - 1];

            if (current.role === Raw.ChatRole.System &&
                prev.role === Raw.ChatRole.System) {
                // Merge system messages
                prev.content = prev.content.concat(current.content);
                result.messages.splice(i, 1);
                i--;
            }
        }

        // 2. Insert cache breakpoints
        if (options.enableCaching) {
            insertCacheBreakpoints(result.messages, this.endpoint);
        }

        // 3. Extract references
        const references = getUniqueReferences(result.metadata);

        return {
            messages: result.messages,
            references,
            metadata: result.metadata
        };
    }
}
```

---

## Variables & Context Injection

### Three Injection Mechanisms

#### 1. **Constructor Injection (Services)**

Dependency injection provides access to system services:

```tsx
export class AgentUserMessage extends PromptElement<AgentUserMessageProps> {
    constructor(
        props: AgentUserMessageProps,
        @IPromptVariablesService private readonly promptVariablesService: IPromptVariablesService,
        @ILogService private readonly logService: ILogService,
        @IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
        @ITerminalService private readonly terminalService: ITerminalService,
    ) {
        super(props);
    }

    async render(state: void, sizing: PromptSizing) {
        // Access services to get dynamic data
        const terminalState = await this.terminalService.getState();
        const workspaceInfo = await this.workspaceService.getInfo();

        // Resolve tool references in user query
        const query = await this.promptVariablesService.resolveToolReferencesInPrompt(
            this.props.request,
            this.props.toolReferences
        );

        return <UserMessage>
            <Tag name='userRequest'>{query}</Tag>
        </UserMessage>;
    }
}
```

**Available Services:**
- `IPromptVariablesService` - Resolve @-mentions and variables
- `IWorkspaceContextService` - Workspace structure, files
- `ITerminalService` - Terminal state, running processes
- `IConfigurationService` - User settings
- `IToolsService` - Available tools
- `ILogService` - Logging
- `IInstantiationService` - Create service instances

#### 2. **Props-Based Context (Runtime Data)**

Data passed from parent components:

```tsx
interface AgentPromptProps {
    readonly endpoint: IChatEndpoint;           // Model info
    readonly location: ChatLocation;            // Chat location (panel, editor, etc.)
    readonly promptContext: IBuildPromptContext;
}

interface IBuildPromptContext {
    readonly query: string;                     // User's query
    readonly tools: LanguageModelTool[];        // Available tools
    readonly chatVariables: IChatVariableData[];// @-mentions
    readonly conversation: Conversation;        // Full history
    readonly toolCallResult?: ToolCallResult;   // Previous tool results
    readonly toolReferences: ToolReference[];   // Tool references in query
    readonly editedFileEvents: FileEvent[];     // Recent file changes
}
```

**Usage:**

```tsx
<AgentPrompt
    endpoint={endpoint}
    location={location}
    promptContext={{
        query: "Fix the authentication bug",
        tools: availableTools,
        chatVariables: [{ name: 'file', value: '/path/to/auth.ts' }],
        conversation: conversationHistory,
        toolCallResult: lastToolResult,
    }}
/>
```

#### 3. **Dynamic Context Components**

Self-contained components that fetch their own data:

```tsx
// Current date/time
export class CurrentDatePrompt extends PromptElement {
    render() {
        const now = new Date();
        return `The current date is ${now.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })}.`;
    }
}

// User's OS
export class UserOSPrompt extends PromptElement {
    render() {
        return `The user's current OS is: ${process.platform}`;
    }
}

// Git repository context
export class RepoContext extends PromptElement {
    constructor(
        props: any,
        @IGitService private readonly gitService: IGitService
    ) {
        super(props);
    }

    async render() {
        const repo = await this.gitService.getRepository();
        if (!repo) return '';

        return <>
            Repository name: {repo.name}<br />
            Owner: {repo.owner}<br />
            Current branch: {repo.branch}<br />
            Uncommitted changes: {repo.changes.length} files
        </>;
    }
}
```

### Context Injection Example

**Full context injection in `GlobalAgentContext`:**

```tsx
export class GlobalAgentContext extends PromptElement {
    async render(state: void, sizing: PromptSizing) {
        return <>
            <Tag name='environment_info'>
                <UserOSPrompt />
            </Tag>

            <Tag name='workspace_info'>
                <AgentTasksInstructions />
                <WorkspaceFoldersHint />
                <MultirootWorkspaceStructure
                    maxSize={2000}
                    excludeDotFiles={true}
                />
            </Tag>

            <Tag name='user_preferences'>
                <UserPreferences />
            </Tag>
        </>;
    }
}
```

---

## Prompt Components Hierarchy

### Complete Component Tree

```
AgentPrompt (Root Orchestrator)
│
├── SystemMessage
│   ├── CopilotIdentityRules
│   │   └── "You are GitHub Copilot, an AI coding assistant..."
│   ├── SafetyRules / Gpt5SafetyRule
│   │   └── Content policy, harmful content guidelines
│   └── Model-Specific Instructions
│       ├── DefaultAgentPrompt
│       │   ├── Tag<'instructions'>
│       │   │   ├── Core capabilities
│       │   │   ├── Tool usage philosophy
│       │   │   └── Output formatting
│       │   ├── Tag<'toolUseInstructions'>
│       │   │   ├── When to use tools
│       │   │   ├── Parallel vs sequential
│       │   │   └── Tool-specific guidance
│       │   └── Tag<'editFileInstructions'>
│       │       ├── edit_file vs replace_string
│       │       └── Model-specific edit patterns
│       ├── AlternateGPTPrompt (GPT-specific)
│       ├── Claude45DefaultPrompt (Claude 4.5)
│       ├── DefaultGeminiAgentPrompt (Gemini)
│       └── VSCModelPrompt (Internal models)
│
├── CustomInstructions
│   ├── .copilot-instructions.md (workspace root)
│   ├── .github/copilot-instructions.md
│   └── User settings custom instructions
│
├── GlobalAgentContext (UserMessage)
│   ├── Tag<'environment_info'>
│   │   └── UserOSPrompt
│   ├── Tag<'workspace_info'>
│   │   ├── AgentTasksInstructions
│   │   ├── WorkspaceFoldersHint
│   │   └── MultirootWorkspaceStructure
│   │       ├── Directory tree
│   │       ├── File counts
│   │       └── Excluded patterns
│   └── Tag<'user_preferences'>
│       └── UserPreferences
│
├── ConversationHistory
│   └── For each previous turn:
│       ├── AgentUserMessageInHistory
│       │   ├── ChatVariables (attachments)
│       │   │   ├── @workspace
│       │   │   ├── @file
│       │   │   └── @terminal
│       │   └── Tag<'userRequest'>
│       ├── ChatToolCalls
│       │   └── For each tool call:
│       │       ├── Tool name
│       │       ├── Tool input
│       │       └── Tool result
│       └── AssistantMessage
│           └── Previous response text
│
└── CurrentUserMessage
    ├── NotebookFormat (if in notebook)
    │   └── Cell structure instructions
    ├── ChatVariables (current @-mentions)
    │   ├── File contents
    │   ├── Workspace info
    │   └── Terminal state
    ├── ToolReferencesHint
    │   └── "The user mentioned tools: X, Y, Z"
    ├── Tag<'context'>
    │   ├── CurrentDatePrompt
    │   ├── EditedFileEvents
    │   │   └── Recent file changes by user
    │   ├── NotebookSummaryChange
    │   ├── TerminalStatePromptElement
    │   │   ├── Active terminals
    │   │   ├── Current working directory
    │   │   └── Running processes
    │   └── TodoListContextPrompt
    │       └── Active todos from manage_todo_list tool
    ├── CurrentEditorContext
    │   ├── Active file path
    │   ├── Language ID
    │   ├── Cursor position
    │   └── Current selection
    ├── RepoContext
    │   ├── Repository name
    │   ├── Owner
    │   ├── Current branch
    │   └── Uncommitted changes
    ├── Tag<'reminderInstructions'>
    │   ├── KeepGoingReminder
    │   │   └── "Continue until fully resolved"
    │   ├── EditingReminder
    │   │   └── "Edit files directly, don't just suggest"
    │   ├── NotebookReminderInstructions
    │   │   └── Notebook-specific reminders
    │   └── FileCreationReminder
    │       └── "Always prefer editing over creating"
    └── Tag<'userRequest'>
        └── Resolved user query with tool references
```

### Component Reusability

Components are designed to be **highly reusable**:

```tsx
// Used in multiple intents
<CurrentEditorContext endpoint={endpoint} />

// Reused across different model prompts
<Tag name='instructions'>
    <DefaultToolUseInstructions />
</Tag>

// Shared safety rules
<SafetyRules />

// Common workspace context
<MultirootWorkspaceStructure maxSize={2000} />
```

---

## Model-Specific Prompts

### Registry-Based Dynamic Selection

**File:** `src/extension/prompts/node/agent/promptRegistry.ts`

```typescript
export const PromptRegistry = new class {
    private readonly promptsWithMatcher: PromptWithMatcher[] = [];
    private readonly familyPrefixList: { prefix: string; prompt: IAgentPromptCtor }[] = [];

    registerPrompt(prompt: IAgentPromptCtor): void {
        // Register custom matchers
        if (prompt.matchesModel) {
            this.promptsWithMatcher.push(prompt);
        }

        // Register family prefixes
        for (const prefix of prompt.familyPrefixes) {
            this.familyPrefixList.push({ prefix, prompt });
        }
    }

    async getPrompt(endpoint: IChatEndpoint): Promise<IAgentPromptCtor | undefined> {
        // 1. Try custom matchers first (most specific)
        for (const prompt of this.promptsWithMatcher) {
            if (await prompt.matchesModel(endpoint)) {
                return prompt;
            }
        }

        // 2. Fall back to family prefix matching
        for (const { prefix, prompt } of this.familyPrefixList) {
            if (endpoint.family.startsWith(prefix)) {
                return prompt;
            }
        }

        // 3. Return default if no match
        return undefined;
    }
}();
```

### Model Implementations

#### **1. Anthropic (Claude)**

**File:** `src/extension/prompts/node/agent/anthropicPrompts.tsx`

```tsx
class AnthropicPromptResolver implements IAgentPrompt {
    static readonly familyPrefixes = ['claude', 'Anthropic'];

    resolvePrompt(endpoint: IChatEndpoint): PromptConstructor | undefined {
        const normalizedModel = endpoint.model?.replace(/\./g, '-');

        // Claude 4.5 optimization
        if (normalizedModel?.startsWith('claude-sonnet-4-5') ||
            normalizedModel?.startsWith('claude-haiku-4-5')) {
            return Claude45DefaultPrompt;
        }

        // Generic Claude
        return DefaultAnthropicAgentPrompt;
    }
}

// Auto-register
PromptRegistry.registerPrompt(AnthropicPromptResolver);
```

**Claude 4.5 Specific Prompt:**

```tsx
class Claude45DefaultPrompt extends PromptElement<DefaultAgentPromptProps> {
    async render() {
        return <InstructionMessage>
            <Tag name='instructions'>
                By default, implement changes rather than only suggesting them.
                Continue working until the user's request is completely resolved.

                You are proactive, detail-oriented, and thorough in your approach.
                You anticipate edge cases and potential issues.
            </Tag>

            <Tag name='workflowGuidance'>
                For complex projects, maintain careful tracking of progress:
                - Break down tasks systematically
                - Track completion of each step
                - Verify changes work as intended
            </Tag>

            <Tag name='communicationStyle'>
                Maintain clarity and directness.
                For straightforward queries, keep answers brief.
                For complex tasks, provide structured explanations.

                Do NOT use emojis unless explicitly requested by the user.
            </Tag>

            {await this.getToolInstructions()}
            {await this.getEditInstructions()}
        </InstructionMessage>;
    }
}
```

#### **2. OpenAI (GPT)**

**File:** `src/extension/prompts/node/agent/openai/gpt5Prompt.tsx`

Multiple GPT variants registered:

```tsx
class GPT5PromptResolver implements IAgentPrompt {
    static readonly familyPrefixes = ['gpt-5', 'openai-gpt-5'];

    static async matchesModel(endpoint: IChatEndpoint): Promise<boolean> {
        return endpoint.model?.startsWith('gpt-5') ?? false;
    }

    resolvePrompt(endpoint: IChatEndpoint): PromptConstructor | undefined {
        // GPT-5 specific optimizations
        return GPT5DefaultPrompt;
    }
}

PromptRegistry.registerPrompt(GPT5PromptResolver);
```

**Alternate GPT Prompt (Experimental):**

```tsx
export class AlternateGPTPrompt extends PromptElement<DefaultAgentPromptProps> {
    async render() {
        return <InstructionMessage>
            <Tag name='structuredWorkflow'>
                # Workflow<br />
                1. Understand the problem deeply<br />
                2. Investigate the codebase thoroughly<br />
                3. Develop a clear, step-by-step plan<br />
                4. Implement the fix incrementally<br />
                5. Debug as needed<br />
                6. Test frequently<br />
                7. Iterate until the issue is fully resolved
            </Tag>

            <Tag name='investigationGuidance'>
                Before making changes:
                - Read relevant files completely
                - Understand the full context
                - Identify root causes, not just symptoms
                - Consider architectural implications
            </Tag>

            <Tag name='communicationGuidelines'>
                Always communicate clearly and concisely in a warm and friendly yet professional tone.
                Provide context for your decisions.
                Explain trade-offs when relevant.
            </Tag>

            {await this.getToolInstructions()}
        </InstructionMessage>;
    }
}
```

#### **3. Google (Gemini)**

**File:** `src/extension/prompts/node/agent/geminiPrompts.tsx`

```tsx
class GeminiPromptResolver implements IAgentPrompt {
    static readonly familyPrefixes = ['gemini', 'google'];

    resolvePrompt(endpoint: IChatEndpoint): PromptConstructor | undefined {
        return DefaultGeminiAgentPrompt;
    }
}

export class DefaultGeminiAgentPrompt extends PromptElement<DefaultAgentPromptProps> {
    async render() {
        return <InstructionMessage>
            <Tag name='coreInstructions'>
                You are an AI programming assistant integrated into VS Code.
                Your goal is to help users write, understand, and improve code.
            </Tag>

            {await this.getToolInstructions()}
            {await this.getEditInstructions()}

            <Tag name='geminiSpecificGuidance'>
                Leverage your multimodal capabilities when relevant.
                Be concise but thorough in explanations.
            </Tag>
        </InstructionMessage>;
    }
}
```

#### **4. VSC Models (Internal)**

**File:** `src/extension/prompts/node/agent/vscModelPrompts.tsx`

Hidden internal models with heavily customized prompts:

```tsx
class VSCModelPromptResolver implements IAgentPrompt {
    static readonly familyPrefixes = ['vsc'];

    resolvePrompt(endpoint: IChatEndpoint): PromptConstructor | undefined {
        if (endpoint.model === 'vsc-model-a') {
            return VSCModelPromptA;
        }
        return VSCDefaultPrompt;
    }
}

class VSCModelPromptA extends PromptElement<DefaultAgentPromptProps> {
    async render() {
        return <InstructionMessage>
            <Tag name='planning_instructions'>
                Use the manage_todo_list tool to track todos and progress.

                NOTE that you should not use this tool if there is only one trivial task.
                Only use it for complex multi-step tasks.
            </Tag>

            <Tag name='preamble_instructions'>
                You need to write **preambles**: short, natural-language status blurbs
                that appear before your main response.

                CADENCE: You MUST provide preambles at key milestones:
                - Before starting major steps
                - After completing significant work
                - When changing direction

                FORMAT: 1-2 sentences, present tense, active voice.
                Example: "Analyzing the authentication flow..."
            </Tag>

            <Tag name='final_answer_instructions'>
                Use hierarchical headings (##, ###, ####).
                Add relevant emojis to highlight key sections.
                Structure your response for easy scanning.
            </Tag>

            {await this.getToolInstructions()}
        </InstructionMessage>;
    }
}
```

#### **5. xAI (Grok)**

**File:** `src/extension/prompts/node/agent/xAIPrompts.tsx`

```tsx
class XAIPromptResolver implements IAgentPrompt {
    static readonly familyPrefixes = ['grok', 'xai'];

    resolvePrompt(endpoint: IChatEndpoint): PromptConstructor | undefined {
        return DefaultXAIPrompt;
    }
}
```

### Registration Process

**File:** `src/extension/prompts/node/agent/allAgentPrompts.ts`

```typescript
// Import all prompt implementations
// Each file self-registers via PromptRegistry.registerPrompt()

import './anthropicPrompts';      // Claude
import './geminiPrompts';         // Gemini
import './openai/gpt51Prompt';    // GPT-5.1
import './openai/gpt5Prompt';     // GPT-5
import './openai/gpt5CodexPrompt'; // GPT-5 Codex
import './openai/gpt51CodexPrompt'; // GPT-5.1 Codex
import './openai/defaultOpenAIPrompt'; // Generic GPT
import './vscModelPrompts';       // Internal VSC models
import './xAIPrompts';            // Grok

// All prompts are now registered in PromptRegistry
```

### Model Detection Flow

```typescript
// 1. Get model endpoint
const endpoint: IChatEndpoint = {
    family: 'claude',
    model: 'claude-sonnet-4-5',
    // ...
};

// 2. Get appropriate prompt class
const PromptClass = await PromptRegistry.getPrompt(endpoint);
// Returns: Claude45DefaultPrompt

// 3. Instantiate with dependency injection
const prompt = instantiationService.createInstance(
    PromptClass,
    { endpoint, location, promptContext }
);

// 4. Render prompt
const result = await prompt.render(state, sizing);
```

---

## Key Files Reference

### Core Prompt Infrastructure

#### **Prompt Orchestration**
- `src/extension/prompts/node/agent/agentPrompt.tsx`
  - Root prompt orchestrator
  - Composes all prompt sections
  - Model-specific instruction selection

#### **Rendering Engine**
- `src/extension/prompts/node/base/promptRenderer.ts`
  - TSX → Chat messages conversion
  - Token budget management
  - Cache breakpoint insertion
  - Message consolidation

#### **Base Instructions**
- `src/extension/prompts/node/agent/defaultAgentInstructions.tsx`
  - Core agent instructions
  - Tool usage guidelines
  - Edit file instructions
  - Output formatting rules

### Model-Specific Prompts

#### **Anthropic (Claude)**
- `src/extension/prompts/node/agent/anthropicPrompts.tsx`
  - Claude family resolver
  - Model variant detection
  - `Claude45DefaultPrompt` - Claude 4.5 optimized
  - `DefaultAnthropicAgentPrompt` - Generic Claude

#### **OpenAI (GPT)**
- `src/extension/prompts/node/agent/openai/defaultOpenAIPrompt.tsx` - Base GPT
- `src/extension/prompts/node/agent/openai/gpt5Prompt.tsx` - GPT-5
- `src/extension/prompts/node/agent/openai/gpt51Prompt.tsx` - GPT-5.1
- `src/extension/prompts/node/agent/openai/gpt5CodexPrompt.tsx` - Codex variant
- `src/extension/prompts/node/agent/openai/alternateGPTPrompt.tsx` - Experimental

#### **Google (Gemini)**
- `src/extension/prompts/node/agent/geminiPrompts.tsx`
  - Gemini family resolver
  - `DefaultGeminiAgentPrompt`

#### **Other Models**
- `src/extension/prompts/node/agent/vscModelPrompts.tsx` - Internal VSC models
- `src/extension/prompts/node/agent/xAIPrompts.tsx` - Grok/xAI models

### Registry & Selection

- `src/extension/prompts/node/agent/promptRegistry.ts`
  - Prompt registration system
  - Model matcher logic
  - Family prefix matching

- `src/extension/prompts/node/agent/allAgentPrompts.ts`
  - Import all prompt implementations
  - Trigger auto-registration

### Reusable Components

#### **Context Components**
- `src/extension/prompts/common/currentDatePrompt.tsx` - Current date
- `src/extension/prompts/common/userOSPrompt.tsx` - Operating system
- `src/extension/prompts/common/currentEditorContext.tsx` - Active editor
- `src/extension/prompts/common/repoContext.tsx` - Git repository
- `src/extension/prompts/common/terminalStatePromptElement.tsx` - Terminal state
- `src/extension/prompts/common/multirootWorkspaceStructure.tsx` - Workspace tree

#### **Structural Components**
- `src/extension/prompts/common/tag.tsx` - XML-like tags
- `src/extension/prompts/common/textChunk.tsx` - Token-aware content
- `src/extension/prompts/common/instructionMessage.tsx` - Conditional message type

#### **Rules & Safety**
- `src/extension/prompts/common/copilotIdentityRules.tsx` - Identity definition
- `src/extension/prompts/common/safetyRules.tsx` - Content policy
- `src/extension/prompts/common/gpt5SafetyRule.tsx` - GPT-5 specific safety

### Tool Instructions

- `src/extension/prompts/node/agent/toolInstructions.tsx`
  - Tool usage philosophy
  - When to use which tool
  - Parallel vs sequential execution

- `src/extension/prompts/node/agent/editFileInstructions.tsx`
  - `edit_file` vs `replace_string` vs `apply_patch`
  - Model-specific edit patterns
  - Diff format handling

### Conversation & History

- `src/extension/prompts/common/conversationHistory.tsx`
  - Render previous turns
  - Tool call history
  - Summarization integration

- `src/extension/prompts/common/chatToolCalls.tsx`
  - Tool invocation formatting
  - Tool result display

---

## Application to Your Patent Agent

### Recommended Prompt Architecture

Based on this analysis, here's how to structure your patent AI agent's system prompts:

#### **1. Base Architecture: TSX-Like Components**

Create a component-based prompt system (you can use a similar approach with templates):

```typescript
// Base prompt component
interface PromptComponent {
    name: string;
    render(context: Context): Promise<string>;
    priority?: number;
    maxTokens?: number;
}

// Patent agent base prompt
class PatentAgentPrompt {
    private components: PromptComponent[] = [];

    addComponent(component: PromptComponent): void {
        this.components.push(component);
    }

    async render(context: Context, tokenBudget: number): Promise<string> {
        // Sort by priority
        const sorted = this.components.sort((a, b) =>
            (b.priority ?? 0) - (a.priority ?? 0)
        );

        // Render components
        const parts: string[] = [];
        let tokensUsed = 0;

        for (const component of sorted) {
            if (tokensUsed >= tokenBudget) break;

            const content = await component.render(context);
            const tokens = estimateTokens(content);

            if (tokensUsed + tokens <= tokenBudget) {
                parts.push(content);
                tokensUsed += tokens;
            }
        }

        return parts.join('\n\n');
    }
}
```

#### **2. Model-Specific Prompt Registry**

```typescript
interface ModelPromptResolver {
    familyPrefixes: string[];
    matchesModel(endpoint: LLMEndpoint): boolean;
    resolvePrompt(endpoint: LLMEndpoint): PromptClass;
}

class PatentPromptRegistry {
    private resolvers: ModelPromptResolver[] = [];

    register(resolver: ModelPromptResolver): void {
        this.resolvers.push(resolver);
    }

    getPrompt(endpoint: LLMEndpoint): PromptClass {
        // Try custom matchers
        for (const resolver of this.resolvers) {
            if (resolver.matchesModel(endpoint)) {
                return resolver.resolvePrompt(endpoint);
            }
        }

        // Fallback to default
        return DefaultPatentPrompt;
    }
}

// Claude-specific patent prompt
class ClaudePatentPromptResolver implements ModelPromptResolver {
    familyPrefixes = ['claude'];

    matchesModel(endpoint: LLMEndpoint): boolean {
        return endpoint.family.startsWith('claude');
    }

    resolvePrompt(endpoint: LLMEndpoint): PromptClass {
        if (endpoint.model?.includes('sonnet-4')) {
            return ClaudePatentExpertPrompt; // Optimized for Claude 4
        }
        return DefaultPatentPrompt;
    }
}
```

#### **3. Dynamic Context Components**

```typescript
// Current date for patent filing
class CurrentDateComponent implements PromptComponent {
    name = 'current_date';
    priority = 100;

    async render(context: Context): Promise<string> {
        return `Current date: ${new Date().toISOString().split('T')[0]}`;
    }
}

// Patent search context
class PatentSearchContextComponent implements PromptComponent {
    name = 'patent_context';
    priority = 90;

    async render(context: Context): Promise<string> {
        return `
# Patent Search Context
Database: ${context.database}
Jurisdiction: ${context.jurisdiction}
Classification: ${context.classification}
Search scope: ${context.searchScope}
        `.trim();
    }
}

// Prior art references
class PriorArtComponent implements PromptComponent {
    name = 'prior_art';
    priority = 80;
    maxTokens = 5000;

    async render(context: Context): Promise<string> {
        if (!context.priorArt || context.priorArt.length === 0) {
            return '';
        }

        const refs = context.priorArt.map((art, i) =>
            `[${i+1}] ${art.title} (${art.patentNumber}) - ${art.summary}`
        ).join('\n');

        return `
# Prior Art References
${refs}
        `.trim();
    }
}

// Active claim drafting
class ClaimDraftingComponent implements PromptComponent {
    name = 'claim_drafting';
    priority = 70;

    async render(context: Context): Promise<string> {
        if (context.intent !== 'drafting') return '';

        return `
# Claim Drafting Guidelines
- Use clear, precise language
- Include all essential elements
- Avoid overly broad claims
- Follow ${context.jurisdiction} format standards
- Reference figures and examples appropriately
        `.trim();
    }
}
```

#### **4. Intent-Specific Prompts**

```typescript
// Search intent prompt
class PatentSearchPrompt extends PatentAgentPrompt {
    constructor() {
        super();
        this.addComponent(new CurrentDateComponent());
        this.addComponent(new PatentSearchContextComponent());
        this.addComponent(new SearchToolInstructionsComponent());
        this.addComponent(new SafetyRulesComponent());
    }
}

// Drafting intent prompt
class PatentDraftingPrompt extends PatentAgentPrompt {
    constructor() {
        super();
        this.addComponent(new CurrentDateComponent());
        this.addComponent(new ClaimDraftingComponent());
        this.addComponent(new PriorArtComponent());
        this.addComponent(new LegalComplianceComponent());
        this.addComponent(new DraftingToolInstructionsComponent());
    }
}

// Analysis intent prompt
class PatentAnalysisPrompt extends PatentAgentPrompt {
    constructor() {
        super();
        this.addComponent(new CurrentDateComponent());
        this.addComponent(new PriorArtComponent());
        this.addComponent(new NoveltyAnalysisComponent());
        this.addComponent(new AnalysisToolInstructionsComponent());
    }
}
```

#### **5. Tool Instructions Component**

```typescript
class ToolInstructionsComponent implements PromptComponent {
    name = 'tool_instructions';
    priority = 85;

    constructor(private availableTools: Tool[]) {}

    async render(context: Context): Promise<string> {
        const toolDocs = this.availableTools.map(tool => `
## ${tool.name}
${tool.description}

**Use when:** ${tool.useCase}
**Input:** ${JSON.stringify(tool.schema, null, 2)}
**Example:** ${tool.example}
        `).join('\n');

        return `
# Available Tools
You have access to the following tools:

${toolDocs}

## Tool Usage Guidelines
- Use tools in parallel when operations are independent
- Use sequential execution when one tool's output feeds another
- Always validate tool inputs before execution
- Handle tool errors gracefully
        `.trim();
    }
}
```

#### **6. Conversation History Component**

```typescript
class ConversationHistoryComponent implements PromptComponent {
    name = 'conversation_history';
    priority = 60;
    maxTokens = 10000;

    async render(context: Context): Promise<string> {
        if (!context.conversation || context.conversation.length === 0) {
            return '';
        }

        // Summarize if too long
        if (estimateTokens(context.conversation) > this.maxTokens) {
            return await this.summarize(context.conversation);
        }

        const history = context.conversation.map(turn => `
## Turn ${turn.id}
User: ${turn.userMessage}
Assistant: ${turn.assistantMessage}
${turn.toolCalls ? `Tools used: ${turn.toolCalls.map(t => t.name).join(', ')}` : ''}
        `).join('\n');

        return `
# Conversation History
${history}
        `.trim();
    }

    private async summarize(conversation: Turn[]): Promise<string> {
        // Use LLM to summarize conversation
        return `# Conversation Summary\n${summary}`;
    }
}
```

### Example: Full Patent Agent Prompt

```typescript
// Usage
const endpoint: LLMEndpoint = {
    family: 'claude',
    model: 'claude-sonnet-4-5'
};

const context: Context = {
    intent: 'drafting',
    database: 'USPTO',
    jurisdiction: 'US',
    priorArt: [...],
    conversation: [...],
    availableTools: [
        patentSearchTool,
        priorArtTool,
        claimGeneratorTool
    ]
};

// Get model-specific prompt
const PromptClass = PatentPromptRegistry.getPrompt(endpoint);
const prompt = new PromptClass();

// Render with token budget
const systemPrompt = await prompt.render(context, 50000);

// Send to LLM
const response = await llm.chat({
    system: systemPrompt,
    messages: [...context.conversation],
    tools: context.availableTools
});
```

---

## Summary: Key Architectural Insights

### 1. **Dynamic, Not Static**
- Prompts are generated at runtime based on context
- No hardcoded strings - everything is composable
- Adapts to model, tools, workspace, and user state

### 2. **Component-Based Architecture**
- TSX/React-like composition
- Reusable, testable components
- Props and dependency injection

### 3. **Token Budget Awareness**
- Priority system for content importance
- Intelligent truncation (least important first)
- Flexible growth for dynamic sizing
- Summarization when needed

### 4. **Model-Specific Optimization**
- Registry pattern for model detection
- Custom prompts per model family
- Model-specific instructions and formatting

### 5. **Context-Rich by Default**
- Automatic workspace, git, terminal integration
- User preferences and custom instructions
- Conversation history with tool results
- Current editor state and file changes

### 6. **Service-Driven Design**
- Dependency injection for system access
- Clean separation of concerns
- Easy to test and mock

### 7. **Production-Grade Features**
- Prompt caching support
- Reference extraction
- Metadata accumulation
- Async rendering
- Cancellation token support

### 8. **Extensible & Maintainable**
- Easy to add new components
- Registry pattern for models
- Clear component boundaries
- Type-safe with TypeScript

---

## Key Takeaways for Patent Agent

1. **Don't use static prompts** - Build a dynamic composition system
2. **Create reusable components** - Context, tools, instructions, etc.
3. **Implement token budgets** - Priority-based content selection
4. **Support multiple models** - Registry pattern for model-specific optimizations
5. **Inject context automatically** - Current date, user state, prior art, etc.
6. **Make it testable** - Component-based design enables unit tests
7. **Plan for scale** - Summarization, caching, and budget management built-in

This architecture will scale beautifully to your patent agent with many tools and complex workflows!

---

**Generated:** 2025-11-20
**Source:** VSCode Copilot Chat Extension - System Prompt Analysis
