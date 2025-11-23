/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OpenAI-Compatible Chat Completions Endpoint
 *
 * Add this to your /Users/neoak/projects/patnet-ai-backend/src/routes/chat.ts
 * This makes your backend compatible with VSCode Copilot Chat extension
 *
 * Required dependencies (install in your backend project):
 * - express
 * - @ai-sdk/openai
 * - ai
 */

// @ts-ignore - These imports will be available in the target backend project
import { Request, Response } from 'express';
// @ts-ignore
import { openai } from '@ai-sdk/openai';
// @ts-ignore
import { stepCountIs, streamText } from 'ai';

// Type definitions for OpenAI-compatible request
interface ChatCompletionRequest {
	model?: string;
	messages: Array<{
		role: 'system' | 'user' | 'assistant';
		content: string;
	}>;
	stream?: boolean;
	tools?: unknown;
	temperature?: number;
	max_tokens?: number;
}

// Define tools - replace with your actual tools configuration
// This should match the tools from your chat.ts file
const tools = {
	// Add your tools here, e.g.:
	// weather: tool({ ... }),
	// convertFahrenheitToCelsius: tool({ ... }),
};

/**
 * POST /v1/chat/completions - OpenAI-compatible chat completions endpoint
 *
 * Add this to your existing chatRouter in chat.ts:
 *
 * import { chatCompletionsHandler } from './backend_chat_completions_endpoint';
 * chatRouter.post('/completions', chatCompletionsHandler);
 */
export async function chatCompletionsHandler(req: Request, res: Response) {
	try {
		// Parse OpenAI-compatible request
		const body = req.body as ChatCompletionRequest;
		const {
			model = 'gpt-4o',
			messages,
			stream = false,
			tools: requestTools,
			temperature,
			max_tokens,
		} = body;

		// Validate messages
		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({
				error: {
					message: 'messages is required and must be an array',
					type: 'invalid_request_error',
					code: 'invalid_messages'
				}
			});
		}

		// Optional: Validate API key
		const authHeader = req.headers.authorization;
		const apiKey = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;
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
		// For now, accept any non-empty key

		// Log request for debugging
		console.log('[Patent AI] Chat request:', {
			model,
			messageCount: messages.length,
			stream,
			hasTools: !!requestTools,
		});

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
			// ========================================
			// STREAMING RESPONSE (OpenAI SSE format)
			// ========================================
			res.setHeader('Content-Type', 'text/event-stream');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');
			res.setHeader('Access-Control-Allow-Origin', '*'); // CORS if needed

			const completionId = `chatcmpl-${Date.now()}`;
			const created = Math.floor(Date.now() / 1000);

			console.log('[Patent AI] Starting streaming response');

			// Send initial chunk with role
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
			let tokenCount = 0;
			for await (const delta of result.textStream) {
				tokenCount++;
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

			console.log(`[Patent AI] Streaming complete (${tokenCount} chunks)`);

		} else {
			// ========================================
			// NON-STREAMING RESPONSE (OpenAI format)
			// ========================================
			console.log('[Patent AI] Generating non-streaming response');

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
					completion_tokens: 0, // TODO: Calculate if needed
					total_tokens: 0
				}
			};

			res.json(response);
			console.log('[Patent AI] Non-streaming response sent');
		}

	} catch (error) {
		console.error('[Patent AI] Chat completions error:', error);

		if (!res.headersSent) {
			res.status(500).json({
				error: {
					message: error instanceof Error ? error.message : 'Internal server error',
					type: 'internal_server_error',
					code: 'server_error'
				}
			});
		} else {
			// Stream was already started, just end it
			res.end();
		}
	}
}

/**
 * Example server.ts configuration:
 *
 * import express from 'express';
 * import { chatRouter } from './routes/chat';
 *
 * const app = express();
 *
 * app.use(express.json());
 *
 * // Mount chat router at /v1/chat
 * app.use('/v1/chat', chatRouter);
 *
 * // Health check
 * app.get('/v1/health', (req, res) => {
 *   res.json({ status: 'ok', timestamp: Date.now() });
 * });
 *
 * const PORT = process.env.PORT || 8000;
 * app.listen(PORT, () => {
 *   console.log(`[Patent AI] Server running on http://localhost:${PORT}`);
 *   console.log(`[Patent AI] Chat endpoint: http://localhost:${PORT}/v1/chat/completions`);
 * });
 */

/**
 * Test commands:
 *
 * # Non-streaming
 * curl -X POST http://localhost:8000/v1/chat/completions \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer test-key" \
 *   -d '{
 *     "model": "gpt-4o",
 *     "messages": [{"role": "user", "content": "Hello!"}],
 *     "stream": false
 *   }'
 *
 * # Streaming
 * curl -X POST http://localhost:8000/v1/chat/completions \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer test-key" \
 *   -d '{
 *     "model": "gpt-4o",
 *     "messages": [{"role": "user", "content": "Hello!"}],
 *     "stream": true
 *   }'
 */
