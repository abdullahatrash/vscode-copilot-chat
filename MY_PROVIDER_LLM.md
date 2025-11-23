## Implementing a `LanguageModelChatProvider` for Your Own Backend

This guide explains **how to create your own VS Code extension that exposes your language model** via the `vscode.lm` API. Other extensions (and the Chat UI) can then use your model like any built‑in model.

The focus here is the **“LanguageModelChatProvider in another extension”** path we discussed.

---

## 1. Overview

- **Goal**: Route VS Code Chat (and other extensions) to **your own backend**.
- **How**:
  - Implement a `LanguageModelChatProvider` in a separate extension.
  - Register it via `vscode.lm.registerLanguageModelChatProvider(...)`.
  - Convert VS Code chat messages ↔ your API’s format.
  - Stream responses and tool calls back via `LanguageModel*Part` objects.

You get full control over networking, auth, and protocol without forking this Copilot extension.

---

## 2. Prerequisites

- **Tools**:
  - Node.js (LTS)
  - VS Code
  - `yo` + `generator-code` or `@vscode/create-extension`
- **Knowledge**:
  - TypeScript basics
  - How to call your backend (REST / gRPC / WebSocket)

---

## 3. Create a New VS Code Extension

- **Scaffold the extension** (TypeScript):

```bash
# Option A: Yeoman
npm install -g yo generator-code
yo code

# Option B: Official helper
npx @vscode/create-extension@latest
```

- Choose “**New Extension (TypeScript)**”.
- This gives you:
  - `package.json`
  - `src/extension.ts` (with `activate` / `deactivate`)
  - `tsconfig.json`, etc.

---

## 4. Declare a Language Model Provider in `package.json`

In your new extension’s `package.json`, add:

```jsonc
{
  "contributes": {
    "languageModelChatProviders": [
      {
        "vendor": "myvendor",
        "id": "myvendor.chat",
        "displayName": "My Vendor Models",
        "description": "Models served by my backend",
        "enablements": [
          "true"
        ]
      }
    ]
  }
}
```

- **`vendor`**: a globally unique name (e.g. `"myvendor"`).
- **`id`**: an identifier for this provider.
- VS Code will expect you to **register a provider** with the same vendor string.

---

## 5. Implement the `LanguageModelChatProvider` Class

In `src/extension.ts`:

```ts
import * as vscode from 'vscode';

class MyChatProvider implements vscode.LanguageModelChatProvider {
  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    // TODO: Return metadata for your models
    return [
      {
        id: 'my-model-1',
        name: 'My Model 1',
        family: 'my-family',
        version: '1.0.0',
        maxInputTokens: 16000,
        maxOutputTokens: 4096,
        requiresAuthorization: { label: 'My backend' }, // or undefined/false
        capabilities: {
          toolCalling: true,      // if your backend supports tools
          imageInput: false       // set true if you support images
        },
        // Optional: detail, tooltip, category, statusIcon, etc.
      }
    ];
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>,
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    token: vscode.CancellationToken
  ): Promise<void> {
    // TODO: Map VS Code messages -> your API request, call backend,
    //       and stream response via progress.report(...)
  }

  async provideTokenCount(
    model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2,
    token: vscode.CancellationToken
  ): Promise<number> {
    // TODO: Implement real tokenizer call or a reasonable estimate
    return this.estimateTokens(text);
  }

  private estimateTokens(
    text: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2
  ): number {
    const str =
      typeof text === 'string'
        ? text
        : text.content
            .map(part => ('value' in part ? String((part as any).value) : ''))
            .join('');
    // crude approximation: 1 token ≈ 4 chars
    return Math.ceil(str.length / 4);
  }
}
```

---

## 6. Register the Provider in `activate()`

Still in `src/extension.ts`:

```ts
export function activate(context: vscode.ExtensionContext) {
  const provider = new MyChatProvider();
  const disposable = vscode.lm.registerLanguageModelChatProvider('myvendor', provider);
  context.subscriptions.push(disposable);
}

export function deactivate() {}
```

- The vendor string `'myvendor'` **must match** the `vendor` in your `package.json` contribution.

---

## 7. Implement `provideLanguageModelChatResponse`

This is the core of your integration.

### 7.1. Translate VS Code messages to your API

- VS Code gives you an array of `LanguageModelChatMessage` / `LanguageModelChatMessage2`:
  - `role`: `User`, `Assistant`, `System`
  - `content`: array of parts (`LanguageModelTextPart`, `LanguageModelToolResultPart2`, etc.)

**Example mapping:**

```ts
function toBackendMessages(
  messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>
): any[] {
  return messages.map(msg => {
    const role =
      msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' :
      msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' :
      'system';

    const contentText = msg.content
      .filter(part => part instanceof vscode.LanguageModelTextPart)
      .map(part => (part as vscode.LanguageModelTextPart).value)
      .join('');

    return { role, content: contentText };
  });
}
```

### 7.2. Call your backend

- **If your backend is OpenAI‑like**: POST to `/v1/chat/completions` or `/responses`.
- **If it’s custom**: call whatever URL/transport and normalize into a stream of tokens / messages.

Example (REST, non‑streaming):

```ts
import fetch from 'node-fetch'; // or node’s built‑in fetch in newer runtimes

async function callBackend(apiUrl: string, body: any, abortSignal: AbortSignal) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add your auth headers here
      'Authorization': `Bearer ${process.env.MY_BACKEND_KEY ?? ''}`
    },
    body: JSON.stringify(body),
    signal: abortSignal
  });

  if (!res.ok) {
    throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}
```

### 7.3. Stream results back via `progress.report`

Inside `provideLanguageModelChatResponse`:

```ts
async provideLanguageModelChatResponse(
  model: vscode.LanguageModelChatInformation,
  messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>,
  options: vscode.ProvideLanguageModelChatResponseOptions,
  progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
  token: vscode.CancellationToken
): Promise<void> {
  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());

  const backendMessages = toBackendMessages(messages);

  // Shape this according to your API
  const requestBody = {
    model: model.id,
    messages: backendMessages,
    max_tokens: options.modelOptions?.max_tokens ?? model.maxOutputTokens,
    temperature: options.modelOptions?.temperature ?? 0.2
  };

  const responseJson = await callBackend(process.env.MY_BACKEND_URL!, requestBody, controller.signal);

  // For non‑streaming: just emit once
  const text = responseJson.choices?.[0]?.message?.content ?? '';
  if (text) {
    progress.report(new vscode.LanguageModelTextPart(text));
  }
}
```

If your backend supports **streaming**, you’d parse chunks and call `progress.report(...)` for each chunk, similar to `extChatEndpoint.ts`:

```ts
progress.report(new vscode.LanguageModelTextPart(chunkText));
```

For **tool calls**, you’d emit:

```ts
progress.report(new vscode.LanguageModelToolCallPart(callId, toolName, inputObject));
```

---

## 8. Token Counting (`provideTokenCount`)

You have three options:

- **Exact**: call a tokenizer endpoint on your backend.
- **Approximate**: heuristic (chars / 4).
- **Hybrid**: exact for short inputs, approximate for large ones.

VS Code uses this to enforce `maxInputTokens` and show UX warnings; it doesn’t have to be perfect, but it should be roughly correct.

---

## 9. Running and Testing

- Run in debug:

```bash
npm install
npm run compile
# in VS Code: press F5 to run the extension in a new window
```

- In the new window:
  - Open **Chat** (or use the command palette).
  - If your provider is wired to the Chat UI, you should see your model in the **model picker** for LM clients that know about it.
  - Programmatically, you can test with another extension or from this one:

```ts
const [model] = await vscode.lm.selectChatModels({ vendor: 'myvendor' });
if (model) {
  const response = await model.sendRequest(
    [
      {
        role: vscode.LanguageModelChatMessageRole.User,
        content: [new vscode.LanguageModelTextPart('Hello from my backend!')]
      }
    ],
    {},
    new vscode.CancellationTokenSource().token
  );
}
```

---

## 10. How This Relates to Copilot / Agent Mode

- Your provider exposes **models under your vendor** (e.g. `myvendor`).
- Copilot in this repo primarily uses its own vendor (`copilot`) and internal endpoint provider.
- To get **Copilot‑like behavior with your models**, you can either:
  - Make your backend **OpenAI‑compatible** and use the BYOK/CustomOAI path already built into this extension, or
  - Build your own “agent” extension that:
    - Uses `vscode.lm.selectChatModels({ vendor: 'myvendor' })`.
    - Implements tools / prompts / UI similar to what Copilot does.

If you share your backend’s exact API shape (OpenAI‑compatible vs custom), I can extend this doc with a concrete, ready‑to‑paste provider implementation for that API.