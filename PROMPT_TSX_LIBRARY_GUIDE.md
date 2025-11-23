# @vscode/prompt-tsx Library Guide

> Complete guide to Microsoft's official prompt-tsx library for building dynamic AI prompts with TSX/JSX

---

## Overview

**Library:** `@vscode/prompt-tsx`
**Version:** 0.4.0-alpha.5 (used in this project)
**Publisher:** Microsoft
**Purpose:** Declare prompts using TSX for VS Code extensions that integrate with Copilot Chat

### Key Resources

- **GitHub:** https://github.com/microsoft/vscode-prompt-tsx
- **NPM:** https://www.npmjs.com/package/@vscode/prompt-tsx
- **Official Docs:** https://code.visualstudio.com/api/extension-guides/ai/prompt-tsx

---

## Why Use This Library?

### Problems It Solves

❌ **Without prompt-tsx:**
- Manual string concatenation for prompts
- Hard to compose features
- Difficult to stay within token limits
- No automatic pruning
- Poor maintainability

✅ **With prompt-tsx:**
- Declarative TSX components
- Automatic token management
- Priority-based pruning
- Flexible token allocation
- Clean, maintainable code
- Self-optimizing prompts

---

## Installation

### 1. Install Package

```bash
npm install --save @vscode/prompt-tsx
```

### 2. Configure TypeScript

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "vscpp",
    "jsxFragmentFactory": "vscppf"
  }
}
```

**Important:**
- `jsxFactory: "vscpp"` - Factory function for JSX elements
- `jsxFragmentFactory: "vscppf"` - Factory for fragments (`<>...</>`)

---

## Core Concepts

### 1. TSX Components for Prompts

Build prompts like React components:

```tsx
import { PromptElement, UserMessage, SystemMessage } from '@vscode/prompt-tsx';

class MyPrompt extends PromptElement {
    render() {
        return <>
            <SystemMessage>
                You are a helpful assistant.
            </SystemMessage>
            <UserMessage>
                {this.props.query}
            </UserMessage>
        </>;
    }
}
```

### 2. Priority-Based Pruning

When token budgets are exceeded, lower-priority elements are pruned first:

```tsx
<TextChunk priority={100}>  {/* Keep this first */}
    Core instructions
</TextChunk>

<TextChunk priority={50}>   {/* Prune this if needed */}
    Optional context
</TextChunk>
```

**Priority Scale:** 0-100 (higher = more important)

### 3. Flexible Token Management

Control token distribution with flex properties:

```tsx
<TextChunk flexGrow={2}>
    {/* Gets 2x share of available tokens */}
</TextChunk>

<TextChunk flexGrow={1}>
    {/* Gets 1x share of available tokens */}
</TextChunk>
```

---

## Main API

### renderPrompt()

Converts TSX components to language model messages:

```typescript
import { renderPrompt } from '@vscode/prompt-tsx';

const { messages } = await renderPrompt(
    MyPromptComponent,              // TSX component
    { query: "Hello" },             // Props
    { modelMaxPromptTokens: 4096 }, // Options
    chatModel                       // Language model
);

// Returns: vscode.LanguageModelChatMessage[]
```

**Returns:**
```typescript
interface RenderResult {
    messages: LanguageModelChatMessage[];  // Chat messages array
}
```

---

## Components & Elements

### Message Types

#### SystemMessage

System-level instructions:

```tsx
import { SystemMessage } from '@vscode/prompt-tsx';

<SystemMessage>
    You are an expert programmer.
    Follow best practices.
</SystemMessage>
```

#### UserMessage

User queries and context:

```tsx
import { UserMessage } from '@vscode/prompt-tsx';

<UserMessage>
    Fix the authentication bug in auth.ts
</UserMessage>
```

#### AssistantMessage

Previous assistant responses (for conversation history):

```tsx
import { AssistantMessage } from '@vscode/prompt-tsx';

<AssistantMessage>
    I've analyzed the authentication code...
</AssistantMessage>
```

### Structure Components

#### TextChunk

Progressively includes text within token budgets:

```tsx
import { TextChunk } from '@vscode/prompt-tsx';

<TextChunk
    priority={80}       // Importance (0-100)
    flexGrow={2}        // Share of flexible tokens
    flexBasis={1000}    // Base token allocation
    flexReserve={"/5"}  // Reserve proportion of budget
>
    This content will be included based on available tokens.
</TextChunk>
```

**Properties:**
- `priority` - Pruning priority (0-100, higher = keep longer)
- `flexGrow` - Relative share of flexible tokens
- `flexBasis` - Minimum tokens to allocate
- `flexReserve` - Reserve proportion (e.g., "/5" = 1/5 of budget)

#### Chunk

Groups elements for atomic inclusion/exclusion:

```tsx
import { Chunk } from '@vscode/prompt-tsx';

<Chunk priority={75}>
    {/* All or nothing - either fully included or excluded */}
    <FileContent path="auth.ts" />
    <FileContent path="auth.test.ts" />
</Chunk>
```

**Use case:** When multiple pieces must be included together

#### TokenLimit

Sets hard caps on token consumption:

```tsx
import { TokenLimit } from '@vscode/prompt-tsx';

<TokenLimit limit={5000}>
    {/* This content will never exceed 5000 tokens */}
    <LargeFileContent />
</TokenLimit>
```

#### Expandable

Fills remaining budget dynamically:

```tsx
import { Expandable } from '@vscode/prompt-tsx';

<Expandable>
    {/* Expands to use all remaining tokens */}
    <ConversationHistory />
</Expandable>
```

#### passPriority

Allows wrapper components to propagate priority to children:

```tsx
<Wrapper priority={90} passPriority>
    {/* Children inherit priority 90 */}
    <Child1 />
    <Child2 />
</Wrapper>
```

---

## Base Classes

### PromptElement

Base class for all prompt components:

```typescript
import { PromptElement, PromptSizing, PromptPiece } from '@vscode/prompt-tsx';

export class MyPrompt extends PromptElement<Props, State> {
    constructor(props: Props) {
        super(props);
    }

    render(state: State, sizing: PromptSizing): PromptPiece {
        return <>
            {/* TSX content */}
        </>;
    }
}
```

**Generic Parameters:**
- `Props` - Component props type
- `State` - Component state type (default: void)

**Methods:**
- `render(state, sizing)` - Required method to render TSX

### PromptSizing

Token budget information passed to render:

```typescript
interface PromptSizing {
    tokenBudget: number;     // Total tokens available
    consumed: number;        // Tokens used so far
    flexBudget: number;      // Available for flex-grow items
}
```

### PromptPiece

Return type from render (TSX elements):

```typescript
type PromptPiece = JSX.Element | string | number | null | undefined;
```

---

## Best Practices

### 1. Priority Strategy

Recommended priority order:

| Element | Priority | Reason |
|---------|----------|--------|
| Base instructions | 100 | Always needed |
| Current user query | 95 | Essential context |
| Recent conversation | 80 | Immediate context |
| Supporting data | 60 | Helpful but optional |
| Older history | 40 | Nice to have |

```tsx
<TextChunk priority={100}>
    {/* Base instructions */}
</TextChunk>

<TextChunk priority={95}>
    {/* Current query */}
</TextChunk>

<TextChunk priority={80}>
    {/* Recent conversation */}
</TextChunk>

<TextChunk priority={60}>
    {/* Supporting data */}
</TextChunk>

<TextChunk priority={40}>
    {/* Older history */}
</TextChunk>
```

### 2. Conversation History Management

Split history into recent and older parts:

```tsx
class ConversationPrompt extends PromptElement {
    render() {
        const recentTurns = this.props.history.slice(-3);
        const olderTurns = this.props.history.slice(0, -3);

        return <>
            {/* Recent turns - higher priority */}
            <TextChunk priority={80} flexGrow={2}>
                {recentTurns.map(turn => (
                    <Turn key={turn.id} data={turn} />
                ))}
            </TextChunk>

            {/* Older turns - lower priority */}
            <TextChunk priority={40} flexGrow={1}>
                {olderTurns.map(turn => (
                    <Turn key={turn.id} data={turn} />
                ))}
            </TextChunk>
        </>;
    }
}
```

### 3. Dynamic Content Scaling

Use `flexGrow` for content that can expand:

```tsx
<TextChunk priority={70} flexGrow={3}>
    {/* File contents - can grow to fill space */}
    <FileContent path={this.props.filePath} />
</TextChunk>

<TextChunk priority={60} flexGrow={1}>
    {/* Additional context - smaller share */}
    <AdditionalContext />
</TextChunk>
```

### 4. Reserve Proportions

Reserve portions of budget for important sections:

```tsx
<TextChunk flexReserve="/5">
    {/* Reserves 1/5 (20%) of token budget */}
    <CriticalContext />
</TextChunk>

<TextChunk flexReserve="/10">
    {/* Reserves 1/10 (10%) of token budget */}
    <SupportingData />
</TextChunk>
```

---

## Complete Example

### Patent Search Prompt

```tsx
import {
    PromptElement,
    SystemMessage,
    UserMessage,
    TextChunk,
    Chunk,
    TokenLimit,
    PromptSizing,
    renderPrompt
} from '@vscode/prompt-tsx';

// Props interface
interface PatentSearchPromptProps {
    query: string;
    jurisdiction: string;
    priorArt: PriorArt[];
    conversationHistory: Turn[];
}

// Main prompt component
class PatentSearchPrompt extends PromptElement<PatentSearchPromptProps> {
    render(state: void, sizing: PromptSizing): JSX.Element {
        return <>
            {/* System instructions - highest priority */}
            <SystemMessage>
                <TextChunk priority={100}>
                    You are an expert patent search assistant.
                    Your role is to help users search patent databases
                    and analyze prior art.
                </TextChunk>
            </SystemMessage>

            {/* Current context - very high priority */}
            <UserMessage>
                <TextChunk priority={95}>
                    <CurrentContext
                        jurisdiction={this.props.jurisdiction}
                    />
                </TextChunk>

                {/* Prior art - high priority, token limited */}
                <TokenLimit limit={5000}>
                    <TextChunk priority={80} flexGrow={2}>
                        <PriorArtReferences
                            priorArt={this.props.priorArt}
                        />
                    </TextChunk>
                </TokenLimit>

                {/* Conversation history - split priority */}
                <ConversationHistorySection
                    history={this.props.conversationHistory}
                />

                {/* Current query - very high priority */}
                <TextChunk priority={95}>
                    <CurrentQuery query={this.props.query} />
                </TextChunk>
            </UserMessage>
        </>;
    }
}

// Context component
class CurrentContext extends PromptElement<{ jurisdiction: string }> {
    render() {
        return <>
            # Search Context<br />
            Jurisdiction: {this.props.jurisdiction}<br />
            Date: {new Date().toISOString().split('T')[0]}
        </>;
    }
}

// Prior art component
class PriorArtReferences extends PromptElement<{ priorArt: PriorArt[] }> {
    render() {
        if (this.props.priorArt.length === 0) return null;

        return <>
            # Prior Art References<br />
            {this.props.priorArt.map((art, i) => (
                <Chunk key={art.id} priority={75}>
                    [{i+1}] {art.patentNumber}: {art.title}<br />
                    Summary: {art.summary}<br />
                </Chunk>
            ))}
        </>;
    }
}

// Conversation history with split priority
class ConversationHistorySection extends PromptElement<{ history: Turn[] }> {
    render() {
        const recent = this.props.history.slice(-3);
        const older = this.props.history.slice(0, -3);

        return <>
            {/* Recent turns - higher priority */}
            <TextChunk priority={70} flexGrow={2}>
                <h1>Recent Conversation</h1>
                {recent.map(turn => (
                    <TurnDisplay key={turn.id} turn={turn} />
                ))}
            </TextChunk>

            {/* Older turns - lower priority */}
            {older.length > 0 && (
                <TextChunk priority={40} flexGrow={1}>
                    <h1>Earlier Conversation</h1>
                    {older.map(turn => (
                        <TurnDisplay key={turn.id} turn={turn} />
                    ))}
                </TextChunk>
            )}
        </>;
    }
}

// Turn display
class TurnDisplay extends PromptElement<{ turn: Turn }> {
    render() {
        return <>
            User: {this.props.turn.userMessage}<br />
            Assistant: {this.props.turn.assistantMessage}<br />
        </>;
    }
}

// Current query
class CurrentQuery extends PromptElement<{ query: string }> {
    render() {
        return <>
            # Current Query<br />
            {this.props.query}
        </>;
    }
}

// Usage
async function buildPrompt(
    query: string,
    context: SearchContext,
    chatModel: LanguageModel
) {
    const { messages } = await renderPrompt(
        PatentSearchPrompt,
        {
            query,
            jurisdiction: context.jurisdiction,
            priorArt: context.priorArt,
            conversationHistory: context.history
        },
        { modelMaxPromptTokens: chatModel.maxInputTokens },
        chatModel
    );

    return messages;
}
```

---

## Advanced Features

### 1. Async Rendering

Components can be async:

```tsx
class AsyncPrompt extends PromptElement {
    async render() {
        const data = await this.fetchData();

        return <UserMessage>
            {data.content}
        </UserMessage>;
    }

    private async fetchData() {
        // Fetch from API, database, etc.
        return { content: "..." };
    }
}
```

### 2. Dependency Injection

Inject services into components (VSCode-specific):

```tsx
class ServiceAwarePrompt extends PromptElement {
    constructor(
        props: any,
        @IConfigService private configService: IConfigService,
        @IFileService private fileService: IFileService
    ) {
        super(props);
    }

    async render() {
        const config = this.configService.getConfig('key');
        const fileContent = await this.fileService.readFile('path');

        return <UserMessage>
            Config: {config}<br />
            File: {fileContent}
        </UserMessage>;
    }
}
```

### 3. Conditional Rendering

Conditionally include content:

```tsx
class ConditionalPrompt extends PromptElement<{ includeDebug: boolean }> {
    render() {
        return <>
            <SystemMessage>
                Core instructions
            </SystemMessage>

            {this.props.includeDebug && (
                <UserMessage>
                    <TextChunk priority={30}>
                        Debug information
                    </TextChunk>
                </UserMessage>
            )}
        </>;
    }
}
```

### 4. Nested Components

Compose complex prompts:

```tsx
class NestedPrompt extends PromptElement {
    render() {
        return <>
            <BaseInstructions />
            <ContextSection />
            <HistorySection />
            <CurrentQuerySection query={this.props.query} />
        </>;
    }
}

class BaseInstructions extends PromptElement {
    render() {
        return <SystemMessage>
            <TextChunk priority={100}>
                Base system instructions
            </TextChunk>
        </SystemMessage>;
    }
}
```

---

## How It Works (Internals)

### 1. TSX Transformation

```tsx
// You write:
<SystemMessage>
    Hello world
</SystemMessage>

// Transformed to:
vscpp(SystemMessage, null, "Hello world")
```

### 2. Priority-Based Pruning

```
1. Collect all elements with priorities
2. Sort by priority (highest first)
3. Estimate tokens for each element
4. Include elements until budget exhausted
5. Prune remaining lower-priority elements
```

### 3. Token Budget Flow

```
Total Budget (e.g., 4096 tokens)
  ├─> Fixed Priority Items (allocated first)
  │   ├─> Priority 100: 500 tokens
  │   ├─> Priority 95: 300 tokens
  │   └─> Priority 90: 400 tokens
  │
  ├─> Flex Budget (remaining: 2896 tokens)
  │   ├─> flexGrow=2: Gets 2/3 share (1930 tokens)
  │   └─> flexGrow=1: Gets 1/3 share (966 tokens)
  │
  └─> Pruned Items (excluded)
      └─> Priority 30: Excluded (budget exhausted)
```

---

## Comparison with Other Approaches

### String Concatenation (Old Way)

```typescript
// ❌ Hard to maintain, no token management
function buildPrompt(query: string, history: Turn[]) {
    let prompt = "You are a helpful assistant.\n\n";

    for (const turn of history) {
        prompt += `User: ${turn.userMessage}\n`;
        prompt += `Assistant: ${turn.assistantMessage}\n\n`;
    }

    prompt += `User: ${query}`;

    return prompt;
}
```

### Template Literals (Better, but Limited)

```typescript
// ⚠️ Better structure, but no automatic pruning
function buildPrompt(query: string, context: Context) {
    return `
System: You are a helpful assistant.

${context.history.map(t => `
User: ${t.userMessage}
Assistant: ${t.assistantMessage}
`).join('\n')}

User: ${query}
    `.trim();
}
```

### @vscode/prompt-tsx (Best)

```tsx
// ✅ Declarative, maintainable, automatic token management
class Prompt extends PromptElement {
    render() {
        return <>
            <SystemMessage>
                <TextChunk priority={100}>
                    You are a helpful assistant.
                </TextChunk>
            </SystemMessage>

            <TextChunk priority={70} flexGrow={1}>
                {this.props.history.map(t => (
                    <ConversationTurn key={t.id} turn={t} />
                ))}
            </TextChunk>

            <UserMessage>
                <TextChunk priority={95}>
                    {this.props.query}
                </TextChunk>
            </UserMessage>
        </>;
    }
}
```

---

## For Your Patent Agent

### Recommended Usage

```tsx
// 1. Install
npm install @vscode/prompt-tsx

// 2. Create base prompt component
class PatentAgentPrompt extends PromptElement<PatentAgentProps> {
    render() {
        return <>
            <SystemMessage>
                <BaseInstructions priority={100} />
                <ToolInstructions priority={90} tools={this.props.tools} />
                <LegalGuidelines priority={85} />
            </SystemMessage>

            <UserMessage>
                <PatentContext priority={95} context={this.props.context} />
                <PriorArt priority={80} priorArt={this.props.priorArt} />
                <ConversationHistory priority={60} history={this.props.history} />
                <CurrentQuery priority={95} query={this.props.query} />
            </UserMessage>
        </>;
    }
}

// 3. Render to messages
const { messages } = await renderPrompt(
    PatentAgentPrompt,
    props,
    { modelMaxPromptTokens: 50000 },
    model
);

// 4. Send to LLM
const response = await llm.chat({ messages });
```

### Benefits for Patent Agent

1. **Automatic Token Management** - No manual counting
2. **Priority-Based** - Critical patent info always included
3. **Scalable** - Add new components easily
4. **Testable** - Test prompt components in isolation
5. **Maintainable** - Clear structure and composition
6. **Model-Agnostic** - Works with any LLM

---

## Summary

### Key Takeaways

1. **Library:** `@vscode/prompt-tsx` from Microsoft
2. **Purpose:** Build dynamic, token-aware prompts with TSX
3. **Core Feature:** Priority-based pruning when budgets exceeded
4. **Components:** SystemMessage, UserMessage, TextChunk, Chunk, TokenLimit
5. **Properties:** priority, flexGrow, flexBasis, flexReserve
6. **Best Practice:** Split history by recency, use flex for dynamic content

### Why You Should Use It

- ✅ Declarative component architecture
- ✅ Automatic token management
- ✅ Priority-based intelligent pruning
- ✅ Flexible token allocation
- ✅ Clean, maintainable code
- ✅ Production-tested by Microsoft

This is the **industry-standard** way to build prompts for VS Code extensions, and the patterns are applicable to any AI agent system!

---

**Generated:** 2025-11-20
**Source:** Microsoft's @vscode/prompt-tsx library documentation
