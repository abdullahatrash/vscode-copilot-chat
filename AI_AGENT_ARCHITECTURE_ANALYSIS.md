# AI Agent Architecture Analysis

> Analysis of the VSCode Copilot Chat extension's AI agent architecture for building scalable AI agents with extensive tool use and sandboxing capabilities.

---

## Table of Contents

- [Overview](#overview)
- [Core Architecture Pattern](#core-architecture-pattern)
- [Agent Operation Flow](#1-agent-operation-flow-react-pattern)
- [Tool Selection System](#2-tool-selection-system)
- [Context Management](#3-context-management-architecture)
- [System Prompt Structure](#4-system-prompt-structure)
- [Intent Pattern](#5-intent-pattern-multi-mode-agent)
- [Abstraction Layers](#abstraction-layers-to-apply)
- [Design Patterns](#design-patterns-applied)
- [Application to Patent AI Agent](#application-to-patent-ai-agent-web-app)
- [Key Files Reference](#key-files-reference)

---

## Overview

This VSCode extension implements a **single-agent architecture** with specialized intent handlers rather than multiple independent agents. The system uses the **ReAct (Reasoning + Acting)** pattern with dynamic tool selection, robust context management, and model-agnostic design.

**Architecture Type:** Single Agent + Intent System (not multi-agent)

---

## Core Architecture Pattern

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Request                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Intent Detection & Routing                     │
│  (AgentIntent, SearchIntent, EditIntent, etc.)             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Tool Calling Loop (ReAct)                      │
│  1. Build prompt with context                              │
│  2. LLM generates response + tool calls                    │
│  3. Execute tools (parallel/sequential)                    │
│  4. Add tool results to context                            │
│  5. Repeat until complete (max iterations)                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Return Result                             │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

**Agent Manager & Sessions:**
- `src/extension/agents/claude/node/claudeCodeAgent.ts` - Claude-specific agent implementation
  - `ClaudeAgentManager` - Session lifecycle management
  - `ClaudeCodeSession` - Request handling, tool permissions, state tracking

**Intent System:**
- `src/extension/intents/node/agentIntent.ts` - Main agent intent handler
- `src/extension/intents/node/toolCallingLoop.ts` - Tool calling orchestration
- `src/platform/chat/common/chatAgents.ts` - Agent registration system

**Tool Infrastructure:**
- `src/extension/tools/common/toolsRegistry.ts` - Central registry pattern
- `src/extension/tools/common/toolsService.ts` - Tool invocation and validation
- `src/extension/tools/node/allTools.ts` - 40+ available tools

---

## 1. Agent Operation Flow (ReAct Pattern)

### Request Flow

```
User Request
  → ChatParticipantRequestHandler
    → DefaultIntentRequestHandler
      → Intent.invoke() → IntentInvocation
        → ToolCallingLoop.run()
          → buildPrompt()
          → fetch() [LLM call]
          → execute tools
          → repeat until done
        → ResponseProcessor
      → ChatResult with metadata
```

### Tool Calling Loop Implementation

```typescript
abstract class ToolCallingLoop {
  async run(): Promise<IToolCallLoopResult> {
    while (iteration < maxIterations) {
      // 1. Build prompt with context
      const buildPromptResult = await this.buildPrompt(context);

      // 2. Get model response with tool calls
      const response = await this.fetch(buildPromptResult);

      // 3. Execute tool calls
      for (const toolCall of response.toolCalls) {
        const result = await toolsService.invokeTool(toolCall);
        toolCallResults[toolCall.id] = result;
      }

      // 4. If no more tool calls, break
      if (!response.toolCalls.length) break;

      // 5. Continue loop with tool results added to context
    }
  }
}
```

**Key Features:**
- Iterative refinement with max iteration limits
- Tool call results feed back into next iteration
- Early stopping on completion or errors
- Parallel and sequential tool execution

**Reference:** `src/extension/intents/node/toolCallingLoop.ts`

---

## 2. Tool Selection System

### Dynamic Tool Selection

Tools are dynamically selected based on:

1. **Model Capabilities** - Does the LLM support specific tool types?
2. **Task Context** - Editing vs searching vs analysis
3. **User Permissions** - Approval required for destructive actions
4. **Workspace State** - Are tests available? Is it a git repo?
5. **Learning Service** - AI-powered tool recommendations

### Tool Architecture

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute(input: unknown): Promise<ToolResult>
  requiresApproval?: boolean
}
```

### Available Tools (40+)

**File Operations:**
- `readFile` - Read file contents
- `createFile` - Create new files
- `editFile` - Edit existing files
- `applyPatch` - Apply diff patches
- `replaceString` - String replacement edits

**Search & Discovery:**
- `codebase` - Search codebase
- `findFiles` - Find files by pattern
- `findTextInFiles` - Text search
- `searchWorkspaceSymbols` - Symbol search

**Code Intelligence:**
- `doc` - Get documentation
- `usages` - Find references
- `getErrors` - Get diagnostics

**Project Operations:**
- `readProjectStructure` - Directory tree
- `scmChanges` - Git changes
- `manageTodoList` - Task management

**Execution:**
- `CoreRunInTerminal` - Terminal commands
- `runTests` - Test execution
- `runNotebookCell` - Notebook execution

### Tool Registration

```typescript
// Central registry pattern
ToolRegistry.registerTool(tool)
ToolRegistry.registerToolExtension(extension)

// Two-map storage:
// 1. Tool implementations
// 2. Tool extensions (enhancements)
```

### Tool Execution Pipeline

```
Tool Call
  → Input Validation (AJV schema)
  → Permission Check
    → Auto-approve (safe operations like file reads)
    → User confirmation (destructive operations)
  → Tool Execution
  → Result Wrapping (LanguageModelToolResult2)
  → Error Handling
```

**Reference Files:**
- `src/extension/tools/common/toolsRegistry.ts`
- `src/extension/tools/common/toolsService.ts`
- `src/extension/tools/node/allTools.ts`

---

## 3. Context Management Architecture

### Conversation Structure

```typescript
class Conversation {
  readonly sessionId: string;
  private _turns: Turn[];
}

class Turn {
  readonly id: string;
  readonly request: TurnMessage;
  private _promptVariables: ChatVariablesCollection;
  private _toolReferences: InternalToolReference[];
  private _references: PromptReference[];
  private _metadata: Map<unknown, unknown[]>;
}
```

### Context Features

**Turn-Based History:**
- Each turn stores: request, response, tool calls, metadata
- Complete conversation history with references
- Tool call rounds tracking multi-turn interactions

**Variable Collection:**
- `ChatVariablesCollection` manages chat variables
- Supports @file, @workspace, and custom variables
- Reference tracking for all mentioned entities

**Metadata System:**
- Extensible metadata with typed keys
- Constructor-as-key pattern for type safety
- Metadata flows through entire pipeline

**Tool Call Rounds:**
```typescript
interface IToolCallRound {
  responseText: string
  toolCalls: LanguageModelToolCall[]
  retryCount: number
  statefulMarkers: boolean
  thinkingTraces: string[]
}
```

### Context Budget Management

**Token Limits:**
- `MAX_TOOL_RESPONSE_PCT = 0.5` (50% max for tool responses)
- Auto-summarization when budget exceeded
- Cache breakpoints for efficient context reuse
- Tool result truncation at configurable limits

**Summarization Strategy:**
- Triggered when context exceeds token budget
- Preserves critical information
- Compresses older turns
- Maintains reference integrity

**Reference:** `src/extension/prompt/common/conversation.ts`

---

## 4. System Prompt Structure

### Layered Prompt Composition

The system uses JSX-based prompt composition with `@vscode/prompt-tsx`:

```tsx
<AgentPrompt>
  <SystemMessage>
    <CopilotIdentityRules />
    <SafetyRules />
  </SystemMessage>

  <DefaultAgentPrompt>
    <Instructions />
    <ToolUseInstructions />
    <EditFileInstructions />
    <OutputFormatting />
  </DefaultAgentPrompt>

  <CustomInstructions />

  <UserMessage>
    <GlobalAgentContext />
  </UserMessage>

  <ConversationHistory />
  <CurrentUserMessage />
  <ToolCallResults />
</AgentPrompt>
```

### Instruction Categories

1. **Identity & Safety**
   - Copilot identity definition
   - Content policy guidelines
   - Safety guardrails

2. **Core Capabilities**
   - Research-driven approach
   - Creative exploration
   - Tool usage philosophy

3. **Tool Instructions**
   - When to use each tool
   - Parallel vs sequential execution
   - Tool selection criteria

4. **Edit Instructions**
   - Model-specific edit patterns
   - `edit_file` vs `replace_string` vs `apply_patch`
   - Diff format handling

5. **Output Formatting**
   - Markdown conventions
   - Code block formatting
   - Symbol reference patterns

6. **Workflow Guidance**
   - Investigation phase
   - Planning phase
   - Implementation phase
   - Testing phase
   - Validation phase

### Model-Specific Prompts

The system supports multiple LLM providers with specialized prompts:

- `DefaultAgentPrompt` - Base for all models
- `AlternateGPTPrompt` - GPT-specific structured workflow
- `AnthropicPrompts` - Claude-specific optimizations
- `GeminiPrompts` - Gemini-specific features
- `VSCModelPrompts` - VSC model adaptations
- `xAIPrompts` - xAI model customizations

### Prompt Rendering Features

- **Dynamic Content** - Based on available tools, model capabilities, workspace state
- **Token Budget Management** - Flexible growth priorities
- **Cache Breakpoints** - Prompt caching for efficiency
- **IntelliSense Support** - Type-safe prompt construction

**Reference Files:**
- `src/extension/prompts/node/agent/agentPrompt.tsx`
- `src/extension/prompts/node/agent/defaultAgentInstructions.tsx`

---

## 5. Intent Pattern (Multi-Mode Agent)

### Intent-Based Architecture

Instead of multiple agents, the system uses **specialized intent handlers** for different tasks:

```typescript
interface IIntent {
  readonly id: string;
  readonly description: string;
  readonly locations: ChatLocation[];
  invoke(context): Promise<IIntentInvocation>;
  handleRequest?(...): Promise<ChatResult>;
}
```

### Available Intents

Located in `src/extension/intents/node/`:

- **AgentIntent** - Main agentic mode with full tool access
- **AskAgentIntent** - Code search and Q&A focused
- **EditCodeIntent** - Code editing workflows
- **ExplainIntent** - Code explanation
- **WorkspaceIntent** - Workspace-level queries
- **TerminalIntent** - Terminal command assistance
- **SearchIntent** - Codebase search
- **ReviewIntent** - Code review
- **FixIntent** - Bug fixing
- **NewWorkspaceIntent** - Project generation

### Intent Invocation Pattern

```typescript
class IntentInvocation {
  // Build prompt specific to this intent
  buildPrompt(context): Prompt

  // Handle tool calls with intent-specific logic
  handleToolCalls(toolCalls): ToolResults

  // Process response with intent-specific formatting
  processResponse(response): Result
}
```

### Intent Composition

- `AgentIntentInvocation` extends `EditCodeIntentInvocation`
- Composition over inheritance for shared behavior
- Intent-specific tool filtering
- Custom validation and error handling per intent

**Benefits:**
- Easy to add specialized behaviors without modifying core agent
- Shared infrastructure (tool loop, context management)
- Intent-specific prompts and tool sets
- Cleaner code organization

---

## Abstraction Layers to Apply

### Layer 1: Tool Registry (Pluggable Tools)

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute(input: unknown): Promise<ToolResult>
  requiresApproval?: boolean
}

class ToolRegistry {
  static register(tool: Tool): void
  static getTool(name: string): Tool | undefined
  static getAllTools(): Tool[]
}
```

**Pattern:** Centralized registration with runtime discovery

### Layer 2: Intent System (Task Routing)

```typescript
interface Intent {
  id: string
  description: string
  invoke(context: Context): IntentInvocation
}

class IntentInvocation {
  buildPrompt(context: Context): Prompt
  handleToolCalls(calls: ToolCall[]): Promise<ToolResult[]>
  processResponse(response: Response): Result
}
```

**Pattern:** Strategy pattern for task-specific behavior

### Layer 3: Tool Calling Loop (Orchestration)

```typescript
class ToolCallingLoop {
  async run(context: Context): Promise<Result> {
    let iteration = 0
    const maxIterations = 10
    let done = false

    while (iteration < maxIterations && !done) {
      // 1. Build prompt with history
      const prompt = this.buildPrompt(context, history, toolResults)

      // 2. Get LLM response
      const response = await this.llm.chat(prompt)

      // 3. Execute tools
      if (response.toolCalls.length === 0) {
        done = true
        break
      }

      const toolResults = await this.executeTools(response.toolCalls)

      // 4. Add to history
      history.push({ response, toolResults })

      iteration++
    }

    return this.finalizeResult(history)
  }
}
```

**Pattern:** ReAct (Reasoning + Acting) loop with iteration limits

### Layer 4: Context Manager (State Management)

```typescript
class ConversationContext {
  private turns: Turn[] = []

  addTurn(request: Message, response: Message, tools: ToolResult[]): void
  getHistory(maxTokens?: number): Turn[]
  summarize(): Summary
  getRelevantContext(query: string): Context

  // Budget management
  checkBudget(): boolean
  triggerSummarization(): void
}
```

**Pattern:** Memento pattern for conversation state

### Layer 5: Prompt Builder (Composition)

```typescript
class PromptBuilder {
  private layers: PromptLayer[] = []

  addSystemInstructions(instructions: string): this
  addToolDescriptions(tools: Tool[]): this
  addContext(context: Context): this
  addHistory(history: Turn[]): this
  addCurrentRequest(request: Message): this

  build(): Prompt
  estimateTokens(): number
}
```

**Pattern:** Builder pattern with token budget awareness

---

## Design Patterns Applied

### 1. ReAct Pattern (Reasoning + Acting)

**Implementation:** Tool calling loop with iterative refinement

```
Think (LLM reasoning) → Act (Tool execution) → Observe (Tool results) → Repeat
```

**Benefits:**
- Handles complex multi-step tasks
- Self-correcting through iteration
- Natural reasoning flow

### 2. Function Calling Pattern

**Implementation:** Native LLM tool invocation API

- Tool schemas in JSON Schema format
- Parallel and sequential invocation
- Tool result validation and retry logic

### 3. Intent-Based Dispatch

**Implementation:** Route requests to specialized handlers

**Benefits:**
- Separation of concerns
- Easy to extend with new intents
- Shared infrastructure

### 4. Dependency Injection

**Implementation:** Services injected via decorators

```typescript
class AgentService {
  constructor(
    @ILogService private logService: ILogService,
    @IToolsService private toolsService: IToolsService
  ) {}
}
```

### 5. Stream Processing

**Implementation:** Async iterables throughout

```typescript
async function* streamResponse() {
  for await (const chunk of llmResponse) {
    yield processChunk(chunk)
  }
}
```

### 6. Metadata Accumulation

**Implementation:** Extensible metadata with constructor-as-key

```typescript
class PromptMetadata {
  private metadata = new Map<Constructor, unknown[]>()

  add<T>(key: Constructor<T>, value: T): void
  get<T>(key: Constructor<T>): T[]
}
```

### 7. Session Management

**Implementation:** Persistent state across requests

- Session pooling
- Deferred promise pattern for async coordination
- External edit tracking

### 8. Tool Grouping (Virtual Tools)

**Implementation:** Semantic similarity-based tool organization

**Benefits:**
- Token efficiency (fewer tools in prompt)
- Expandable tool groups
- Better tool discovery

---

## Application to Patent AI Agent Web App

### Recommended Architecture

```
PatentAgent
  ├── IntentRouter
  │   ├── SearchIntent (patent database search)
  │   ├── AnalysisIntent (prior art analysis)
  │   ├── DraftingIntent (claim generation)
  │   ├── ReviewIntent (patent validation)
  │   └── ResearchIntent (technical background)
  │
  ├── ToolRegistry
  │   ├── PatentSearchTool (USPTO, EPO, WIPO)
  │   ├── PriorArtTool (similarity search)
  │   ├── CitationTool (legal citation lookup)
  │   ├── SandboxTool (code execution for examples)
  │   ├── DocumentParserTool (PDF/XML parsing)
  │   ├── ClaimGeneratorTool (structured claim drafting)
  │   └── ValidationTool (compliance checking)
  │
  ├── ToolCallingLoop
  │   ├── ReAct orchestration
  │   ├── Max 15 iterations
  │   └── Parallel tool execution
  │
  ├── ContextManager
  │   ├── Turn-based conversation history
  │   ├── Patent document references
  │   ├── Auto-summarization (>100k tokens)
  │   └── Citation tracking
  │
  └── PromptBuilder
      ├── Patent domain instructions
      ├── Legal compliance guidelines
      ├── Tool usage patterns
      └── Context injection
```

### Tool Examples for Patent Agent

**Patent Search Tool:**
```typescript
{
  name: "patent_search",
  description: "Search patent databases (USPTO, EPO, WIPO)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      database: { enum: ["uspto", "epo", "wipo"] },
      filters: {
        type: "object",
        properties: {
          date_range: { type: "string" },
          classification: { type: "string" }
        }
      }
    }
  },
  execute: async (input) => {
    // Search implementation
  }
}
```

**Prior Art Analysis Tool:**
```typescript
{
  name: "prior_art_analysis",
  description: "Analyze prior art for novelty assessment",
  inputSchema: {
    type: "object",
    properties: {
      claims: { type: "array" },
      references: { type: "array" }
    }
  },
  execute: async (input) => {
    // Semantic similarity analysis
  }
}
```

**Sandbox Execution Tool:**
```typescript
{
  name: "execute_code",
  description: "Execute code in sandboxed environment",
  inputSchema: {
    type: "object",
    properties: {
      language: { enum: ["python", "javascript", "java"] },
      code: { type: "string" },
      timeout: { type: "number", default: 30 }
    }
  },
  requiresApproval: true, // User must approve code execution
  execute: async (input) => {
    // Sandbox execution (Docker/VM)
  }
}
```

### Intent Examples

**SearchIntent:**
- Tools: patent_search, find_similar_patents
- Prompt: "You are a patent search specialist..."
- Output: Structured search results with relevance scores

**DraftingIntent:**
- Tools: claim_generator, citation_tool, validation_tool
- Prompt: "You are a patent attorney drafting claims..."
- Output: Formatted patent claims with proper legal language

**AnalysisIntent:**
- Tools: prior_art_analysis, document_parser, similarity_search
- Prompt: "You are analyzing prior art for patentability..."
- Output: Novelty assessment report

### Implementation Steps

1. **Tool Registry Setup**
   - Implement `ToolRegistry` with registration methods
   - Create 10-20 core tools for patent operations
   - Add validation schemas for each tool

2. **Intent System**
   - Define 5-7 key intents for patent workflows
   - Implement `IntentRouter` for request classification
   - Create intent-specific prompts

3. **Tool Calling Loop**
   - Implement ReAct loop with max 15 iterations
   - Add parallel tool execution support
   - Handle tool errors gracefully

4. **Context Management**
   - Implement turn-based conversation storage
   - Add patent document reference tracking
   - Create summarization for long conversations

5. **Prompt Engineering**
   - Write domain-specific system prompts
   - Add legal compliance guidelines
   - Create tool usage examples

6. **Sandbox Integration**
   - Containerized code execution (Docker)
   - Resource limits (CPU, memory, time)
   - Security isolation

### Scaling Considerations

**For Many Tools (50+ tools):**
- Use tool grouping by category
- Implement semantic tool search
- Add tool recommendation system based on context

**For Sandbox Execution:**
- Use containerization (Docker, Firecracker)
- Implement resource quotas
- Add execution timeout and memory limits
- Log all executions for audit

**For Long Conversations:**
- Implement conversation summarization
- Use sliding window context
- Cache frequently accessed data

---

## Key Files Reference

### Agent Core

- **claudeCodeAgent.ts** - `src/extension/agents/claude/node/claudeCodeAgent.ts`
  - Claude agent manager and session handling
  - Session lifecycle, tool permissions

- **agentIntent.ts** - `src/extension/intents/node/agentIntent.ts`
  - Main agent intent handler
  - Tool selection and configuration

- **toolCallingLoop.ts** - `src/extension/intents/node/toolCallingLoop.ts`
  - ReAct loop orchestration (MOST IMPORTANT)
  - Iteration management, tool execution

### Tool System

- **toolsService.ts** - `src/extension/tools/common/toolsService.ts`
  - Tool invocation and validation
  - Permission checking, result wrapping

- **toolsRegistry.ts** - `src/extension/tools/common/toolsRegistry.ts`
  - Tool registration pattern
  - Registry management

- **allTools.ts** - `src/extension/tools/node/allTools.ts`
  - All 40+ tool imports
  - Tool organization

### Context Management

- **conversation.ts** - `src/extension/prompt/common/conversation.ts`
  - Turn and conversation models
  - History management, metadata

- **intents.ts** - `src/extension/intents/common/intents.ts`
  - Intent interfaces
  - Invocation patterns

- **chatVariablesCollection.ts** - `src/extension/prompt/common/chatVariablesCollection.ts`
  - Variable management
  - Reference tracking

### Prompts

- **agentPrompt.tsx** - `src/extension/prompts/node/agent/agentPrompt.tsx`
  - Main prompt structure
  - Component composition

- **defaultAgentInstructions.tsx** - `src/extension/prompts/node/agent/defaultAgentInstructions.tsx`
  - System instructions
  - Tool usage guidelines

- **Model-specific prompts:**
  - `alternateGPTPrompt.tsx` - GPT optimizations
  - `anthropicPrompts.tsx` - Claude optimizations
  - `geminiPrompts.tsx` - Gemini optimizations

### Request Handling

- **defaultIntentRequestHandler.ts** - `src/extension/handlers/node/defaultIntentRequestHandler.ts`
  - Core request handler
  - Intent routing logic

- **chatParticipantRequestHandler.ts** - `src/extension/handlers/vscode-node/chatParticipantRequestHandler.ts`
  - VSCode chat integration
  - UI communication

---

## Architecture Strengths

### 1. Flexible Intent System
Easy to add specialized behaviors without modifying core agent logic

### 2. Robust Tool Ecosystem
40+ tools with validation, permissions, and extension support

### 3. Model-Agnostic Core
Supports Claude, GPT, Gemini with model-specific optimizations

### 4. Rich Context Management
Turn-based history with metadata, summaries, and reference tracking

### 5. Streaming-First Design
Async iterables throughout for responsive user experience

### 6. Type-Safe Prompts
TSX-based prompts with IntelliSense and validation

### 7. Session Persistence
Resume conversations across restarts with state preservation

---

## Conclusion

This architecture provides a **scalable, maintainable foundation** for building AI agents with:

- ✅ Extensive tool ecosystems (40+ tools, easily extensible)
- ✅ Sandboxed execution (permission system, validation)
- ✅ Complex multi-step reasoning (ReAct pattern)
- ✅ Robust context management (turn-based, summarization)
- ✅ Model flexibility (supports multiple LLM providers)
- ✅ Professional code organization (intents, DI, abstractions)

**Ideal for:** Patent AI agents, code assistants, research tools, and any domain requiring extensive tool use with sandboxed operations.

---

**Generated:** 2025-11-20
**Source:** VSCode Copilot Chat Extension Analysis
