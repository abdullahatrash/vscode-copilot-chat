# FlowLeap Mock Backend

A simple OpenAI-compatible mock server for testing the FlowLeap extension without building the full `patent-ai-backend` yet.

## Quick Start

```bash
# Start the mock backend
node mock-backend/server.js

# In another terminal, configure the extension
# Edit .vscode/settings.json:
{
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions",
  "flowleap.apiKey": ""
}

# Press F5 in VS Code to launch the extension
```

## What It Does

This mock backend implements:

1. **OpenAI-compatible Chat Completions API**
   - Streaming responses (Server-Sent Events)
   - Non-streaming responses
   - Tool calling support

2. **Patent Tool Endpoints**
   - `/api/patent/search` - Mock patent search
   - `/api/patent/analyze` - Mock patent analysis

3. **Health Check**
   - `/health` - Server status

## Testing Scenarios

### Basic Chat
Send a regular message in the chat panel:
```
Hello! Can you help me?
```

Expected: Streaming response explaining this is the mock backend.

### Tool Calling
Send a message that triggers a tool:
```
Search for patents about neural networks
```

Expected: Extension calls `patent_search` tool, backend returns mock results.

### Multi-turn Conversation
Send multiple messages in sequence.

Expected: Each message gets a response.

## Endpoints

### POST /v1/chat/completions

OpenAI-compatible chat completions endpoint.

**Request**:
```json
{
  "model": "flowleap-patent-gpt",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true,
  "tools": [...]
}
```

**Response** (streaming):
```
data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"!"}}]}
data: [DONE]
```

### POST /api/patent/search

Mock patent search tool endpoint.

**Request**:
```json
{
  "query": "neural networks",
  "database": "uspto",
  "limit": 10
}
```

**Response**:
```json
{
  "patents": [
    {
      "patent_number": "US10123456B2",
      "title": "Neural Network Architecture...",
      "abstract": "A system and method...",
      "filing_date": "2018-03-15",
      "grant_date": "2020-11-10"
    }
  ],
  "count": 2,
  "query": "neural networks"
}
```

### POST /api/patent/analyze

Mock patent analysis tool endpoint.

**Request**:
```json
{
  "patent_number": "US10123456B2",
  "analysis_type": "full"
}
```

**Response**:
```json
{
  "patent_number": "US10123456B2",
  "claims": {
    "independent_claims": 3,
    "dependent_claims": 17
  },
  "prior_art": [...],
  "prosecution_history": {...}
}
```

## Console Output

The server logs all requests:

```
============================================================
📥 Chat Completion Request
============================================================
Model: flowleap-patent-gpt
Messages: 1
Tools: 2
Stream: true

📨 Received message: Search for patents about neural networks
🔧 Triggering tool call...
✅ Streaming response sent
```

## Customization

Edit `server.js` to:
- Change the response text
- Add more mock patent data
- Implement additional tool endpoints
- Change streaming behavior

## When to Switch to Real Backend

Use this mock backend until:
1. ✅ Extension conversion is complete
2. ✅ All code changes tested
3. ✅ Tool calling works end-to-end
4. ✅ Ready to implement real patent search

Then switch to your real `patent-ai-backend` by just changing the URL:
```json
{
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions"
}
```

(If your real backend uses a different port, update accordingly)

## Troubleshooting

### Port already in use
```bash
# Check what's using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or change the port in server.js
const PORT = 8001;
```

### Extension not connecting
1. Check mock backend is running: `curl http://localhost:8000/health`
2. Check `flowleap.apiUrl` in settings matches the server URL
3. Check VS Code Output panel for errors

### No streaming
Check browser DevTools Network tab:
- Look for `/v1/chat/completions` request
- Check response is `text/event-stream`
- Verify SSE chunks are arriving

## Next Steps

1. Get extension working with this mock backend
2. Build your real `patent-ai-backend`
3. Implement same endpoints (`/v1/chat/completions`, etc.)
4. Switch extension to point to real backend
5. Enjoy! 🎉
