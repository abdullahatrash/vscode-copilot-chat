## Agent Mode Architecture and Implementation

This document explains **how agent mode is implemented in this repo**, what **context** is sent to LLMs, how the **prompts are engineered**, and what **telemetry** is captured. It connects the high-level description from `README.md` to the concrete code paths.

---

## High-Level Flow

At a high level, an agent-mode request flows through these stages:

1. **Chat participant** in VS Code receives the user message.
2. **Intent routing** maps the request to the `Agent` intent.
3. **Prompt building** constructs a structured ChatML prompt:
   - System & safety messages
   - Global environment/workspace context
   - Conversation history (possibly summarized)
   - Per-turn user message & dynamic context
   - Tool definitions and recent tool results
4. **Tool loop** processes LLM tool calls until the task is complete or limits are reached.
5. **Telemetry** captures prompt, tool-usage and outcome metadata tagged as agent mode.

### Architecture Diagram (Markdown / Mermaid)

```mermaid
flowchart TD
    U[User message in VS Code<br/>@edits / agent participant] --> P[ChatParticipants<br/>chatParticipants.ts]
    P --> I[Intent routing<br/>Intent.Agent]
    I --> H[AgentIntentInvocation<br/>agentIntent.ts]
    H -->|buildPrompt| AP[AgentPrompt TSX tree<br/>agentPrompt.tsx]
    AP -->|render| M[ChatML messages<br/>(system, user, tools, history)]
    M --> L[LLM endpoint<br/>(OpenAI, Anthropic, Gemini, etc.)]

    L --> T[Tool calling loop<br/>DefaultIntentRequestHandler]
    T -->|tool calls| Tools[(Tools registry)]
    Tools --> T

    T --> R[Final assistant response]
    R --> VS[VS Code UI<br/>chat + inline edits]

    subgraph Context sent to LLM
      AP
      M
    end

    subgraph Telemetry
      H -. timing, token budget .-> TE[editCodeIntent.promptRender]
      T -. tool usage, tokens .-> TR[toolCallDetails & panel.request]
    end
```

---

## 1. Chat Participants and Intents

### Chat participants

- Chat participants (what the user sees as agents like “Edits”) are registered in `chatParticipants.ts`.
- The **Edits / agent-mode participant** is wired to the `Agent` intent:

```53:193:src/extension/conversation/vscode-node/chatParticipants.ts
private registerEditsAgent(): IDisposable {
    const editingAgent = this.createAgent(editsAgentName, Intent.Agent);
    editingAgent.iconPath = new vscode.ThemeIcon('tools');
    editingAgent.additionalWelcomeMessage = this.additionalWelcomeMessage;
    editingAgent.titleProvider = this.instantiationService.createInstance(ChatTitleProvider);
    return editingAgent;
}
```

- All participants share the same request handler factory:

```251:278:src/extension/conversation/vscode-node/chatParticipants.ts
const handler = this.instantiationService.createInstance(
    ChatParticipantRequestHandler,
    context.history,
    request,
    stream,
    token,
    { agentName: name, agentId: id, intentId },
    onPause
);
return await handler.getResult();
```

### Agent intent & handler options

- `AgentIntent` extends the core edit intent and configures agent-mode behavior:

```184:193:src/extension/intents/node/agentIntent.ts
protected override getIntentHandlerOptions(request: vscode.ChatRequest): IDefaultIntentRequestHandlerOptions | undefined {
    return {
        maxToolCallIterations: getRequestedToolCallIterationLimit(request) ??
            this.configurationService.getNonExtensionConfig('chat.agent.maxRequests') ??
            200, // Fallback for simulation tests
        temperature: this.configurationService.getConfig(ConfigKey.AdvancedExperimental.AgentTemperature) ?? 0,
        overrideRequestLocation: ChatLocation.Agent,
        hideRateLimitTimeEstimate: true
    };
}
```

- **Ask Agent** (agentic Ask mode) reuses the same machinery, but sets `codesearchMode`:

```97:131:src/extension/intents/node/askAgentIntent.ts
export class AskAgentIntentInvocation extends AgentIntentInvocation {
    protected override prompt = AgentPrompt;
    protected override extraPromptProps = { codesearchMode: true };
}
```

---

## 2. Prompt Construction in Agent Mode

### AgentIntentInvocation → AgentPrompt

- `AgentIntentInvocation.buildPrompt` is responsible for:
  - Merging codebase tool results into references.
  - Adjusting the token budget for tools and summarization.
  - Invoking the TSX prompt renderer with `AgentPrompt`.

```231:281:src/extension/intents/node/agentIntent.ts
const tools = await this.getAvailableTools();
const toolTokens = tools?.length ? await this.endpoint.acquireTokenizer().countToolTokens(tools) : 0;

const baseBudget = Math.min(
    this.configurationService.getConfig<number | undefined>(ConfigKey.AdvancedExperimental.SummarizeAgentConversationHistoryThreshold) ?? this.endpoint.modelMaxPromptTokens,
    this.endpoint.modelMaxPromptTokens
);
const useTruncation = this.configurationService.getConfig(ConfigKey.AdvancedExperimental.UseResponsesApiTruncation);
const safeBudget = useTruncation ?
    Number.MAX_SAFE_INTEGER :
    Math.floor((baseBudget - toolTokens) * 0.85);
const endpoint = toolTokens > 0 ? this.endpoint.cloneWithTokenOverride(safeBudget) : this.endpoint;
const summarizationEnabled = this.configurationService.getConfig(ConfigKey.SummarizeAgentConversationHistory) && this.prompt === AgentPrompt;

const props: AgentPromptProps = {
    endpoint,
    promptContext: {
        ...promptContext,
        tools: promptContext.tools && {
            ...promptContext.tools,
            toolReferences: this.stableToolReferences.filter((r) => r.name !== ToolName.Codebase),
        }
    },
    location: this.location,
    enableCacheBreakpoints: summarizationEnabled,
    ...this.extraPromptProps
};

const renderer = PromptRenderer.create(this.instantiationService, endpoint, this.prompt, props);
const result = await renderer.render(progress, token);
```

### AgentPrompt structure

`AgentPrompt` is a TSX component that composes:

- Identity and safety **SystemMessage**.
- Model-specific **agent instructions** (via `PromptRegistry`).
- Optional **custom & mode instructions**.
- A **global agent context** (environment + workspace).
- Either:
  - Full **agent conversation history**, or
  - **Summarized** history when token budgets require it.
- The per-turn **AgentUserMessage** (user request + dynamic context).
- **ChatToolCalls** (truncated tool results).

```75:140:src/extension/prompts/node/agent/agentPrompt.tsx
export class AgentPrompt extends PromptElement<AgentPromptProps> {
    async render(state: void, sizing: PromptSizing) {
        const instructions = await this.getInstructions();

        const baseAgentInstructions = <>
            <SystemMessage>
                You are an expert AI programming assistant, working with a user in the VS Code editor.<br />
                {isGpt5PlusFamily(this.props.endpoint.family) ? (
                    <>
                        <GPT5CopilotIdentityRule />
                        <Gpt5SafetyRule />
                    </>
                ) : (
                    <>
                        <CopilotIdentityRules />
                        <SafetyRules />
                    </>
                )}
            </SystemMessage>
            {instructions}
        </>;
        const baseInstructions = <>
            {!omitBaseAgentInstructions && baseAgentInstructions}
            {await this.getAgentCustomInstructions()}
            <UserMessage>
                {await this.getOrCreateGlobalAgentContext(this.props.endpoint)}
            </UserMessage>
        </>;

        const maxToolResultLength = Math.floor(this.promptEndpoint.modelMaxPromptTokens * MAX_TOOL_RESPONSE_PCT);

        if (this.props.enableCacheBreakpoints) {
            return <>
                {baseInstructions}
                <SummarizedConversationHistory ... />
            </>;
        } else {
            return <>
                {baseInstructions}
                <AgentConversationHistory ... />
                <AgentUserMessage ... />
                <ChatToolCalls ... truncateAt={maxToolResultLength} />
            </>;
        }
    }
}
```

---

## 3. System Prompts and Prompt Registry

### Prompt registry: model-specific prompts

- `PromptRegistry` maps **model families** (e.g. `gpt-5`, `gpt-5-codex`, Anthropic, Gemini) to prompt constructors.
- `AgentPrompt.getInstructions()` uses the registry and falls back to `DefaultAgentPrompt`:

```143:172:src/extension/prompts/node/agent/agentPrompt.tsx
const agentPromptResolver = await PromptRegistry.getPrompt(this.props.endpoint);
if (agentPromptResolver) {
    const resolver = this.instantiationService.createInstance(agentPromptResolver);
    const PromptClass = resolver.resolvePrompt(this.props.endpoint);
    if (PromptClass) {
        return <PromptClass
            availableTools={this.props.promptContext.tools?.availableTools}
            modelFamily={modelFamily}
            codesearchMode={this.props.codesearchMode}
        />;
    }
}

return <DefaultAgentPrompt
    availableTools={this.props.promptContext.tools?.availableTools}
    modelFamily={modelFamily}
    codesearchMode={this.props.codesearchMode}
/>;
```

- `docs/prompts.md` documents the pattern and how to author model-specific prompts.

### Default agent system prompt

`DefaultAgentPrompt` encodes the core agent behavior and tool usage rules:

```50:70:src/extension/prompts/node/agent/defaultAgentInstructions.tsx
export class DefaultAgentPrompt extends PromptElement<DefaultAgentPromptProps> {
    async render(state: void, sizing: PromptSizing) {
        const tools = detectToolCapabilities(this.props.availableTools);

        return <InstructionMessage>
            <Tag name='instructions'>
                You are a highly sophisticated automated coding agent with expert-level knowledge across many different programming languages and frameworks.<br />
                The user will ask a question, or ask you to perform a task, and it may require lots of research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.<br />
                <KeepGoingReminder modelFamily={this.props.modelFamily} />
                ...
                {!this.props.codesearchMode && tools.hasSomeEditTool && <>NEVER print out a codeblock with file changes unless the user asked for it. Use the appropriate edit tool instead.<br /></>}
                {tools[ToolName.CoreRunInTerminal] && <>NEVER print out a codeblock with a terminal command to run unless the user asked for it. Use the {ToolName.CoreRunInTerminal} tool instead.<br /></>}
                You don't need to read a file if it's already provided in context.
            </Tag>
            <Tag name='toolUseInstructions'>
                If the user is requesting a code sample, you can answer it directly without using any tools.<br />
                When using a tool, follow the JSON schema very carefully and make sure to include ALL required properties.<br />
                ...
                Tools can be disabled by the user. You may see tools used previously in the conversation that are not currently available. Be careful to only use the tools that are currently available to you.
            </Tag>
            ...
        </InstructionMessage>;
    }
}
```

Model-specific variants (e.g. `openAIPrompts.tsx`, `anthropicPrompts.tsx`, `geminiPrompts.tsx`, `vscModelPrompts.tsx`) tweak instructions while following the same skeleton.

---

## 4. Context Sent to the LLM

### Global agent context (once per conversation)

- `GlobalAgentContext` is a static `UserMessage` that includes:
  - OS information.
  - Workspace structure and folders.
  - Agent tasks instructions and user preferences.

```236:254:src/extension/prompts/node/agent/agentPrompt.tsx
class GlobalAgentContext extends PromptElement<GlobalAgentContextProps> {
    render() {
        return <UserMessage>
            <Tag name='environment_info'>
                <UserOSPrompt />
            </Tag>
            <Tag name='workspace_info'>
                <AgentTasksInstructions availableTools={this.props.availableTools} />
                <WorkspaceFoldersHint />
                <MultirootWorkspaceStructure maxSize={2000} excludeDotFiles={true} /><br />
                This is the state of the context at this point in the conversation. ...
            </Tag>
            <UserPreferences flexGrow={7} priority={800} />
            {this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
        </UserMessage>;
    }
}
```

### Conversation history and summarization

- **Full history**: `AgentConversationHistory` replays earlier user/assistant turns and tool results.
- **Summarized history**: when `enableCacheBreakpoints` is true and thresholds are exceeded, `SummarizedConversationHistory` collapses older context according to:
  - `github.copilot.chat.summarizeAgentConversationHistoryThreshold`
  - `github.copilot.chat.agentHistorySummarizationMode`
  - `github.copilot.chat.agentHistorySummarizationWithPromptCache`
  - `github.copilot.chat.agentHistorySummarizationForceGpt41`

### Per-turn user message and dynamic context

`AgentUserMessage` wraps the current user query and “ambient” context into a single `UserMessage`:

```314:370:src/extension/prompts/node/agent/agentPrompt.tsx
const query = await this.promptVariablesService.resolveToolReferencesInPrompt(this.props.request, this.props.toolReferences ?? []);
...
return (
    <>
        <UserMessage>
            {hasToolsToEditNotebook && <NotebookFormat ... />}
            <TokenLimit max={sizing.tokenBudget / 6} ...>
                <ChatVariables chatVariables={this.props.chatVariables} isAgent={true} omitReferences />
            </TokenLimit>
            <ToolReferencesHint toolReferences={this.props.toolReferences} modelFamily={this.props.endpoint.family} />
            <Tag name='context'>
                <CurrentDatePrompt />
                <EditedFileEvents editedFileEvents={this.props.editedFileEvents} />
                <NotebookSummaryChange />
                {hasTerminalTool && <TerminalStatePromptElement sessionId={this.props.sessionId} />}
                {hasTodoTool && <TodoListContextPrompt sessionId={this.props.sessionId} />}
            </Tag>
            <CurrentEditorContext endpoint={this.props.endpoint} />
            <RepoContext />
            <Tag name='reminderInstructions'>
                <KeepGoingReminder ... />
                {getEditingReminder(...)}
                <NotebookReminderInstructions ... />
                {getFileCreationReminder(...)}
                {await getExplanationReminder(...)}
                {getVSCModelReminder(shouldIncludePreamble)}
            </Tag>
            {query && <Tag name={shouldUseUserQuery ? 'user_query' : 'userRequest'} priority={900} flexGrow={7}>{query + attachmentHint}</Tag>}
            {this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
        </UserMessage>
    </>
);
```

This gives the LLM:

- The **resolved user query** (with `#tool` references expanded).
- **Chat variables** representing attached files, selections, notebooks, etc., including file contents.
- Structured **context tags** for:
  - Date and edited file events.
  - Terminal state and TODO list (if tools available).
  - Current editor file + selection (without extra content).
  - Git repository context (including GitHub info).
- Repeated **reminders** near the user query (“keep going”, use edit tools, explanation rules, etc.).

### Tool call results

- `ChatToolCalls` injects recent tool results into the prompt as structured content, truncated by `maxToolResultLength` (50% of prompt budget).
- Tools and their semantics are defined in:
  - `package.json` (`contributes.languageModelTools`, `languageModelToolSets`)
  - `src/extension/tools/node/*`
  - Documented in `docs/tools.md`

---

## 5. Telemetry in Agent Mode

### Prompt render telemetry (agent vs edit)

`EditCodeIntentInvocation` distinguishes agent-mode prompt renders:

```423:436:src/extension/intents/node/editCodeIntent.ts
this.telemetryService.sendMSFTTelemetryEvent('editCodeIntent.promptRender', {
}, {
    promptRenderDurationIncludingRunningTools: duration,
    isAgentMode: this.intent.id === Intent.Agent ? 1 : 0,
});
```

### Per-turn panel request telemetry

`PanelChatTelemetry` captures a detailed view of each request/response pair:

```639:670:src/extension/prompt/node/chatParticipantTelemetry.ts
this._telemetryService.sendMSFTTelemetryEvent('panel.request', {
    command: this._intent.id,
    ...
    model: this._endpoint.model,
    apiType: this._endpoint.apiType,
    toolCounts: JSON.stringify(toolCounts),
}, {
    turn: this._conversation.turns.length,
    round: roundIndex,
    messageTokenCount,
    promptTokenCount,
    userPromptCount: this._messages.filter(msg => msg.role === Raw.ChatRole.User).length,
    responseTokenCount,
    timeToRequest: this._requestStartTime - this._startTime,
    timeToFirstToken: this._firstTokenTime ? this._firstTokenTime - this._startTime : -1,
    timeToComplete: Date.now() - this._startTime,
    numToolCalls: toolCalls.length,
    availableToolCount: this._availableToolCount,
    summarizationEnabled: this._configurationService.getConfig(ConfigKey.SummarizeAgentConversationHistory) ? 1 : 0
});
```

### Mode name and isAgent flag

- Mode name is derived from the intent, with `agent` used for `AgentIntent`:

```411:416:src/extension/prompt/node/chatParticipantTelemetry.ts
protected _getModeName(): string {
    return this._request.modeInstructions2 ? 'custom' :
        this._intent.id === AgentIntent.ID ? 'agent' :
            (this._intent.id === EditCodeIntent.ID || this._intent.id === EditCode2Intent.ID) ? 'edit' :
                (this._intent.id === Intent.InlineChat) ? 'inlineChatIntent' :
                    'ask';
}
```

- User action telemetry includes an explicit `isAgent` marker:

```672:705:src/extension/prompt/node/chatParticipantTelemetry.ts
sendUserActionTelemetry(
    this._telemetryService,
    undefined,
    { ... },
    {
        isAgent: this._intent.id === AgentIntent.ID ? 1 : 0,
        turn: this._conversation.turns.length,
        round: roundIndex,
        ...
        numToolCalls: toolCalls.length,
        availableToolCount: this._availableToolCount,
    },
    'panel_request'
);
```

### Tool call and edit quality telemetry

- **Tool calls**:

```457:477:src/extension/prompt/node/chatParticipantTelemetry.ts
this._telemetryService.sendMSFTTelemetryEvent('toolCallDetails', {
    intentId: this._intent.id,
    conversationId: this._conversation.sessionId,
    responseType,
    toolCounts: JSON.stringify(toolCounts),
    model: this._endpoint.model
}, {
    numRequests: toolCallRounds.length,
    turnIndex: this._conversation.turns.length,
    sessionDuration: Date.now() - this._conversation.turns[0].startTime,
    promptTokenCount: this._userTelemetry.measurements.promptTokenLen,
    ...
    invalidToolCallCount
});
```

- **Multi-file edit quality**, including an `isAgent` flag (with a note about a current limitation when edits come via the mapped edits provider):

```150:157:src/platform/multiFileEdit/common/multiFileEditQualityTelemetry.ts
this.telemetryService.sendInternalMSFTTelemetryEvent('multiFileEditQuality',
    {
        requestId: telemetry.chatRequestId,
        speculationRequestId: edit.speculationRequestId,
        // NOTE: for now this will always be false because in agent mode the edits are invoked via the MappedEditsProvider, so we lose the turn ID
        isAgent: String(edit.isAgent),
        outcome,
        prompt: edit.prompt,
        languageId,
        file: documentText,
        mapper: edit.mapper
    },
    ...
);
```

---

## 6. Summary

- **Agent mode** is implemented as a specialized **intent** (`AgentIntent`) wired to a chat participant and powered by a TSX-based **prompt builder** (`AgentPrompt`).
- The **prompt** is richly structured: identity, safety, model-specific instructions, global environment, conversation history (optionally summarized), user query, workspace context, and tool call results.
- A comprehensive suite of **tools** (edit, search, terminal, TODOs, MCP, etc.) is exposed to the model via well-specified schemas and reinforced by prompt instructions.
- **Telemetry** tracks prompt construction, tool usage, performance, and outcomes, with explicit flags that distinguish agent mode from ask/edit/inline modes.


