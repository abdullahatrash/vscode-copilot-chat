/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Centralized check for Patent AI mode.
 * Can be enabled via:
 * 1. Environment variable: PATENT_AI_MODE=true (takes precedence)
 * 2. VS Code setting: patent.enabled=true
 */

/**
 * Check if Patent AI mode is enabled.
 * Checks environment variable first, then VS Code settings.
 */
export function isPatentAIMode(): boolean {
	// Check environment variable first (takes precedence)
	if (process.env.PATENT_AI_MODE === 'true') {
		return true;
	}

	// Check VS Code configuration setting
	try {
		const vscode = require('vscode');
		const config = vscode.workspace.getConfiguration();
		return config.get('patent.enabled', false) as boolean;
	} catch {
		// VS Code API not available (e.g., in tests or worker context)
		return false;
	}
}

/**
 * Get Patent AI API URL from environment or settings.
 */
export function getPatentAPIUrl(): string {
	if (process.env.PATENT_API_URL) {
		return process.env.PATENT_API_URL;
	}

	try {
		const vscode = require('vscode');
		const config = vscode.workspace.getConfiguration();
		return config.get('patent.apiUrl', 'http://localhost:8000/v1/chat/completions') as string;
	} catch {
		return 'http://localhost:8000/v1/chat/completions';
	}
}

/**
 * Get Patent AI API key from environment or settings.
 */
export function getPatentAPIKey(): string {
	if (process.env.PATENT_API_KEY) {
		return process.env.PATENT_API_KEY;
	}

	try {
		const vscode = require('vscode');
		const config = vscode.workspace.getConfiguration();
		return config.get('patent.apiKey', '') as string;
	} catch {
		return '';
	}
}

/**
 * Get base URL for Patent AI backend (without /v1/chat/completions path).
 */
export function getPatentAPIBaseUrl(): string {
	const url = getPatentAPIUrl();
	return url.replace('/v1/chat/completions', '');
}
