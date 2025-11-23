#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mock FlowLeap Backend
 *
 * A simple OpenAI-compatible API server for testing the FlowLeap extension
 * without building the full patent-ai-backend yet.
 *
 * Usage:
 *   node mock-backend/server.js
 *
 * Then configure extension:
 *   "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions"
 */

const http = require('http');
const PORT = 8000;

// Simple request body parser
function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', chunk => body += chunk);
		req.on('end', () => {
			try {
				resolve(JSON.parse(body));
			} catch (e) {
				reject(e);
			}
		});
	});
}

// Generate a streaming response
function* generateStreamingResponse(messages, tools) {
	const userMessage = messages[messages.length - 1]?.content || '';

	console.log('\n📨 Received message:', userMessage);

	// Check if we should call a tool
	const shouldCallTool = tools && tools.length > 0 && (
		userMessage.toLowerCase().includes('search') ||
		userMessage.toLowerCase().includes('patent') ||
		userMessage.toLowerCase().includes('analyze')
	);

	if (shouldCallTool) {
		console.log('🔧 Triggering tool call...');

		// Return a tool call
		yield {
			id: 'chatcmpl-' + Date.now(),
			object: 'chat.completion.chunk',
			created: Math.floor(Date.now() / 1000),
			model: 'flowleap-patent-gpt',
			choices: [{
				index: 0,
				delta: {
					role: 'assistant',
					content: null,
					tool_calls: [{
						id: 'call_' + Date.now(),
						type: 'function',
						function: {
							name: 'patent_search',
							arguments: JSON.stringify({
								query: 'neural networks',
								database: 'uspto',
								limit: 5
							})
						}
					}]
				},
				finish_reason: 'tool_calls'
			}]
		};
	} else {
		// Regular chat response
		const response = `Hello! I'm the FlowLeap Patent IDE mock backend.

I received your message: "${userMessage}"

This is a test response to verify the extension is working correctly.

Available capabilities:
- ✅ Streaming responses (you're seeing one now!)
- ✅ Tool calling (try asking me to "search for patents")
- ✅ Multi-turn conversations
- ✅ No GitHub authentication required

When you're ready, replace this mock backend with your real patent-ai-backend!`;

		// Stream word by word
		const words = response.split(' ');
		for (let i = 0; i < words.length; i++) {
			yield {
				id: 'chatcmpl-' + Date.now(),
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model: 'flowleap-patent-gpt',
				choices: [{
					index: 0,
					delta: {
						content: (i === 0 ? '' : ' ') + words[i]
					},
					finish_reason: null
				}]
			};
		}

		// Final chunk
		yield {
			id: 'chatcmpl-' + Date.now(),
			object: 'chat.completion.chunk',
			created: Math.floor(Date.now() / 1000),
			model: 'flowleap-patent-gpt',
			choices: [{
				index: 0,
				delta: {},
				finish_reason: 'stop'
			}]
		};
	}
}

// Handle chat completions
async function handleChatCompletions(req, res) {
	try {
		const body = await parseBody(req);

		console.log('\n' + '='.repeat(60));
		console.log('📥 Chat Completion Request');
		console.log('='.repeat(60));
		console.log('Model:', body.model);
		console.log('Messages:', body.messages?.length || 0);
		console.log('Tools:', body.tools?.length || 0);
		console.log('Stream:', body.stream);

		if (body.stream) {
			// Streaming response
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				'Access-Control-Allow-Origin': '*'
			});

			for (const chunk of generateStreamingResponse(body.messages, body.tools)) {
				res.write('data: ' + JSON.stringify(chunk) + '\n\n');
				// Simulate network delay
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			res.write('data: [DONE]\n\n');
			res.end();

			console.log('✅ Streaming response sent');
		} else {
			// Non-streaming response
			const response = {
				id: 'chatcmpl-' + Date.now(),
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model: 'flowleap-patent-gpt',
				choices: [{
					index: 0,
					message: {
						role: 'assistant',
						content: 'Hello! This is a non-streaming response from the mock backend.'
					},
					finish_reason: 'stop'
				}],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30
				}
			};

			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(JSON.stringify(response));

			console.log('✅ Non-streaming response sent');
		}
	} catch (error) {
		console.error('❌ Error:', error);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: error.message }));
	}
}

// Handle patent search (for tool testing)
async function handlePatentSearch(req, res) {
	try {
		const body = await parseBody(req);

		console.log('\n' + '='.repeat(60));
		console.log('🔍 Patent Search Request');
		console.log('='.repeat(60));
		console.log('Query:', body.query);
		console.log('Database:', body.database);
		console.log('Limit:', body.limit);

		// Mock patent results
		const mockResults = {
			patents: [
				{
					patent_number: 'US10123456B2',
					title: 'Neural Network Architecture for Patent Classification',
					abstract: 'A system and method for classifying patents using deep learning...',
					filing_date: '2018-03-15',
					grant_date: '2020-11-10',
					inventors: ['John Doe', 'Jane Smith'],
					assignee: 'Tech Corp'
				},
				{
					patent_number: 'US10234567B1',
					title: 'AI-Powered Prior Art Search System',
					abstract: 'An artificial intelligence system for searching and analyzing prior art...',
					filing_date: '2019-06-20',
					grant_date: '2021-03-15',
					inventors: ['Bob Johnson'],
					assignee: 'Patent AI Inc'
				}
			],
			count: 2,
			query: body.query,
			database: body.database || 'all'
		};

		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(JSON.stringify(mockResults));

		console.log('✅ Patent search results sent');
	} catch (error) {
		console.error('❌ Error:', error);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: error.message }));
	}
}

// Handle patent analysis (for tool testing)
async function handlePatentAnalysis(req, res) {
	try {
		const body = await parseBody(req);

		console.log('\n' + '='.repeat(60));
		console.log('📊 Patent Analysis Request');
		console.log('='.repeat(60));
		console.log('Patent Number:', body.patent_number);
		console.log('Analysis Type:', body.analysis_type);

		// Mock analysis results
		const mockAnalysis = {
			patent_number: body.patent_number,
			analysis_type: body.analysis_type || 'full',
			claims: {
				independent_claims: 3,
				dependent_claims: 17,
				total_claims: 20
			},
			prior_art: [
				{ patent_number: 'US9876543B2', relevance_score: 0.85 },
				{ patent_number: 'US9765432B1', relevance_score: 0.72 }
			],
			prosecution_history: {
				office_actions: 2,
				amendments: 3,
				time_to_grant: '18 months'
			}
		};

		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(JSON.stringify(mockAnalysis));

		console.log('✅ Patent analysis results sent');
	} catch (error) {
		console.error('❌ Error:', error);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: error.message }));
	}
}

// Handle CORS preflight
function handleOptions(req, res) {
	res.writeHead(204, {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-FlowLeap-Client, X-FlowLeap-Version'
	});
	res.end();
}

// Main request handler
const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);

	// CORS preflight
	if (req.method === 'OPTIONS') {
		return handleOptions(req, res);
	}

	// Health check
	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'FlowLeap Mock Backend' }));
		return;
	}

	// Chat completions (main endpoint)
	if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
		return handleChatCompletions(req, res);
	}

	// Patent search tool endpoint
	if (url.pathname === '/api/patent/search' && req.method === 'POST') {
		return handlePatentSearch(req, res);
	}

	// Patent analysis tool endpoint
	if (url.pathname === '/api/patent/analyze' && req.method === 'POST') {
		return handlePatentAnalysis(req, res);
	}

	// 404
	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
	console.log('\n' + '='.repeat(60));
	console.log('🚀 FlowLeap Mock Backend Started');
	console.log('='.repeat(60));
	console.log(`📍 URL: http://localhost:${PORT}`);
	console.log(`\n📝 Configure your extension with:`);
	console.log(`   "flowleap.apiUrl": "http://localhost:${PORT}/v1/chat/completions"\n`);
	console.log('Available endpoints:');
	console.log('  - POST /v1/chat/completions    (Chat API)');
	console.log('  - POST /api/patent/search      (Patent search tool)');
	console.log('  - POST /api/patent/analyze     (Patent analysis tool)');
	console.log('  - GET  /health                 (Health check)');
	console.log('\n' + '='.repeat(60));
	console.log('Press Ctrl+C to stop\n');
});
