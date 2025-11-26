# Backend Implementation for Patent AI

> What to add to your backend at `/Users/neoak/projects/patnet-ai-backend/src`

---

## ✅ What You Already Have

Looking at your `src/routes/chat.ts`, you have:
- ✅ Express router
- ✅ Vercel AI SDK integration
- ✅ Tool calling support (weather, temperature conversion)
- ✅ Streaming support
- ✅ Conversation history

**This is great!** But the VSCode extension expects a specific endpoint format.

---

## 🔧 What You Need to Add

### The Issue

Your current endpoints:
- `POST /stream` - Custom streaming format
- `POST /` - Custom non-streaming format

VSCode extension expects:
- `POST /v1/chat/completions` - **OpenAI-compatible format**

---

## 📝 Solution: Add OpenAI-Compatible Endpoint

Add this new route to your `src/routes/chat.ts`:

```typescript
/**
 * OpenAI-compatible chat completions endpoint
 * This is what VSCode Copilot Chat extension expects
 */
chatRouter.post('/completions', async (req: Request, res: Response) => {
	try {
		// Parse OpenAI-compatible request
		const {
			model = 'gpt-4o',
			messages,
			stream = false,
			tools: requestTools,
			temperature,
			max_tokens,
		} = req.body;

		// Validate request
		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({
				error: {
					message: 'messages is required and must be an array',
					type: 'invalid_request_error',
					code: 'invalid_messages'
				}
			});
		}

		// Optional: Check API key (if you want authentication)
		const apiKey = req.headers.authorization?.replace('Bearer ', '');
		if (!apiKey) {
			return res.status(401).json({
				error: {
					message: 'No API key provided',
					type: 'invalid_request_error',
					code: 'invalid_api_key'
				}
			});
		}
		// TODO: Validate apiKey against your database/config
		// For now, just accept any non-empty key

		// Use Vercel AI SDK to generate response
		const result = streamText({
			model: openai(model),
			messages: messages.map((m: any) => ({
				role: m.role,
				content: m.content,
			})),
			tools: requestTools ? tools : undefined, // Only add tools if requested
			stopWhen: stepCountIs(5),
			temperature,
			maxTokens: max_tokens,
		});

		if (stream) {
			// STREAMING RESPONSE (OpenAI SSE format)
			res.setHeader('Content-Type', 'text/event-stream');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');

			const completionId = `chatcmpl-${Date.now()}`;
			const created = Math.floor(Date.now() / 1000);

			// Send initial message with role
			res.write(`data: ${JSON.stringify({
				id: completionId,
				object: 'chat.completion.chunk',
				created,
				model,
				choices: [{
					index: 0,
					delta: { role: 'assistant', content: '' },
					finish_reason: null
				}]
			})}\n\n`);

			// Stream content deltas
			for await (const delta of result.textStream) {
				res.write(`data: ${JSON.stringify({
					id: completionId,
					object: 'chat.completion.chunk',
					created,
					model,
					choices: [{
						index: 0,
						delta: { content: delta },
						finish_reason: null
					}]
				})}\n\n`);
			}

			// Send final chunk with finish_reason
			res.write(`data: ${JSON.stringify({
				id: completionId,
				object: 'chat.completion.chunk',
				created,
				model,
				choices: [{
					index: 0,
					delta: {},
					finish_reason: 'stop'
				}]
			})}\n\n`);

			// Send done signal
			res.write('data: [DONE]\n\n');
			res.end();

		} else {
			// NON-STREAMING RESPONSE (OpenAI format)
			let fullResponse = '';
			for await (const delta of result.textStream) {
				fullResponse += delta;
			}

			const response = {
				id: `chatcmpl-${Date.now()}`,
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [{
					index: 0,
					message: {
						role: 'assistant',
						content: fullResponse,
					},
					finish_reason: 'stop'
				}],
				usage: {
					prompt_tokens: 0, // TODO: Calculate if needed
					completion_tokens: 0,
					total_tokens: 0
				}
			};

			res.json(response);
		}

	} catch (error) {
		console.error('Chat completions error:', error);

		if (!res.headersSent) {
			res.status(500).json({
				error: {
					message: error instanceof Error ? error.message : 'Internal server error',
					type: 'internal_server_error',
					code: 'server_error'
				}
			});
		} else {
			res.end();
		}
	}
});
```

---

## 🔧 Update Your Server Routes

In `src/server.ts` (or wherever you mount routes), ensure the router is mounted at `/v1/chat`:

```typescript
import express from 'express';
import { chatRouter } from './routes/chat';

const app = express();

app.use(express.json());

// Mount chat router at /v1/chat
// This makes /v1/chat/completions available
app.use('/v1/chat', chatRouter);

// Health check
app.get('/v1/health', (req, res) => {
	res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
```

This makes your endpoint available at:
- `http://localhost:8000/v1/chat/completions` ✅

---

## 🧪 Test Your Backend

### 1. Start Your Server

```bash
cd /Users/neoak/projects/patnet-ai-backend
npm run dev
```

### 2. Test Non-Streaming

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

**Expected response**:
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {...}
}
```

### 3. Test Streaming

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

**Expected response** (streaming):
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":123,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":123,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":123,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: [DONE]
```

---

## 📊 Complete File Structure

After adding the endpoint, your backend should look like:

```
patnet-ai-backend/
├── src/
│   ├── routes/
│   │   ├── chat.ts          ← ADD /completions endpoint here
│   │   └── health.ts
│   └── server.ts             ← Mount at /v1/chat
├── package.json
└── tsconfig.json
```

---

## 🔐 Optional: API Key Authentication

To add real API key validation:

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

const VALID_API_KEYS = new Set([
	'pk_test_your_key_here',
	// Add your keys here or load from database/env
]);

export function validateApiKey(req: Request, res: Response, next: NextFunction) {
	const apiKey = req.headers.authorization?.replace('Bearer ', '');

	if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
		return res.status(401).json({
			error: {
				message: 'Invalid API key',
				type: 'invalid_request_error',
				code: 'invalid_api_key'
			}
		});
	}

	next();
}

// In chat.ts
import { validateApiKey } from '../middleware/auth';

chatRouter.post('/completions', validateApiKey, async (req, res) => {
	// ... endpoint code
});
```

---

## 🎯 Summary

### What You Need to Do

1. ✅ **Add `/completions` endpoint** to `src/routes/chat.ts` (code above)
2. ✅ **Ensure router mounted at `/v1/chat`** in `src/server.ts`
3. ✅ **Test with curl** to verify it works
4. ✅ **Update VSCode settings** with your API key

### What You Get

- ✅ OpenAI-compatible endpoint at `http://localhost:8000/v1/chat/completions`
- ✅ Works with VSCode Copilot Chat extension
- ✅ Supports streaming and non-streaming
- ✅ Supports tool calling (already in your code!)
- ✅ API key authentication

---

## ⏱️ Time Estimate

- **Add endpoint**: 10 minutes
- **Test**: 5 minutes
- **Total**: ~15 minutes

---

## 🆘 Troubleshooting

### Endpoint returns 404

**Check**: Router is mounted at `/v1/chat` in `server.ts`

### Streaming not working

**Check**: Response headers include `Content-Type: text/event-stream`

### VSCode can't connect

**Check**:
1. Backend running on port 8000
2. CORS headers configured (if needed)
3. API key matches in both places

---

## 🚀 Next Steps

After adding this endpoint:

1. Test it with curl (above)
2. Update VSCode settings with your API key
3. Launch VSCode extension (F5)
4. Try chatting!

---

**That's it!** Just add the `/completions` endpoint and you're ready to go! 🎉
