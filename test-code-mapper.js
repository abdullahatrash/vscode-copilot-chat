#!/usr/bin/env node

/**
 * Test script for Patent AI Code Mapper
 * This tests the backend endpoint directly
 */

const PATENT_API_URL = process.env.PATENT_API_URL || 'http://localhost:8000';

async function testCodeMapper() {
	console.log('🧪 Testing Patent AI Code Mapper...\n');
	console.log(`📍 Backend URL: ${PATENT_API_URL}\n`);

	// Test 1: Health check
	console.log('1️⃣  Testing backend health...');
	try {
		const healthResponse = await fetch(`${PATENT_API_URL}/v1/health`);
		const healthData = await healthResponse.json();
		console.log('   ✅ Backend is healthy:', healthData.service);
	} catch (error) {
		console.error('   ❌ Backend health check failed:', error.message);
		console.error('   💡 Make sure backend is running: cd /Users/neoak/projects/patnet-ai-backend && npm run dev');
		process.exit(1);
	}

	// Test 2: Simple insertion
	console.log('\n2️⃣  Testing simple code insertion...');
	try {
		const response = await fetch(`${PATENT_API_URL}/v1/code-mapper`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				existingCode: '',
				newCode: 'console.log("Hello, World!");',
				filePath: 'test.js',
				instruction: 'Add the code to the file'
			})
		});

		const result = await response.json();

		if (!response.ok) {
			console.error('   ❌ Request failed:', response.status, result);
			process.exit(1);
		}

		if (!result.success) {
			console.error('   ❌ Code mapper returned error:', result.error);
			process.exit(1);
		}

		console.log('   ✅ Generated', result.edits.length, 'edit(s)');
		console.log('   📝 Edit:', JSON.stringify(result.edits[0], null, 2));
	} catch (error) {
		console.error('   ❌ Test failed:', error.message);
		process.exit(1);
	}

	// Test 3: Adding to existing code
	console.log('\n3️⃣  Testing code modification...');
	try {
		const existingCode = `function greet() {
  console.log('Hello');
}

greet();`;

		const newCode = `console.log('Starting...');`;

		const response = await fetch(`${PATENT_API_URL}/v1/code-mapper`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				existingCode,
				newCode,
				filePath: 'test.js',
				instruction: 'Add the new code at the top of the file'
			})
		});

		const result = await response.json();

		if (!response.ok) {
			console.error('   ❌ Request failed:', response.status, result);
			process.exit(1);
		}

		if (!result.success) {
			console.error('   ❌ Code mapper returned error:', result.error);
			process.exit(1);
		}

		console.log('   ✅ Generated', result.edits.length, 'edit(s)');
		console.log('   📝 Edit range:', result.edits[0].range);
		console.log('   📝 New text preview:', result.edits[0].newText.substring(0, 50).replace(/\n/g, '\\n'));
	} catch (error) {
		console.error('   ❌ Test failed:', error.message);
		process.exit(1);
	}

	// Test 4: Replacing code
	console.log('\n4️⃣  Testing code replacement...');
	try {
		const existingCode = `function greet() {
  console.log('Hello');
}`;

		const newCode = `function greet(name) {
  console.log('Hello, ' + name);
}`;

		const response = await fetch(`${PATENT_API_URL}/v1/code-mapper`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				existingCode,
				newCode,
				filePath: 'test.js',
				instruction: 'Replace the function with the new version'
			})
		});

		const result = await response.json();

		if (!response.ok) {
			console.error('   ❌ Request failed:', response.status, result);
			process.exit(1);
		}

		if (!result.success) {
			console.error('   ❌ Code mapper returned error:', result.error);
			process.exit(1);
		}

		console.log('   ✅ Generated', result.edits.length, 'edit(s)');
		console.log('   📝 Edit range:', result.edits[0].range);
	} catch (error) {
		console.error('   ❌ Test failed:', error.message);
		process.exit(1);
	}

	console.log('\n✅ All tests passed! Patent AI Code Mapper is working correctly.\n');
	console.log('📋 Next steps:');
	console.log('   1. Launch extension: Press F5 in VS Code (PATENT_AI_MODE=true is already configured)');
	console.log('   2. Open test file: /Users/neoak/projects/vscode-copilot-chat/test-edit.js');
	console.log('   3. Try editing with Copilot Chat - should work WITHOUT GitHub Copilot authentication!');
	console.log('   4. Check logs for: "[Patent AI] Using Patent AI Code Mapper"\n');
}

testCodeMapper().catch(error => {
	console.error('\n💥 Unexpected error:', error);
	process.exit(1);
});
