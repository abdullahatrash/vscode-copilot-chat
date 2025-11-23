/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

/**
 * Contribution for Patent AI backend integration.
 *
 * This contribution handles initialization and validation of Patent AI mode.
 * The actual service registration happens in services.ts, but this contribution
 * validates configuration and logs initialization status.
 *
 * When Patent mode is enabled:
 * - Validates API key is configured
 * - Logs backend URL
 * - Provides helpful warnings if misconfigured
 */
export class PatentContribution extends Disposable implements IExtensionContribution {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
	) {
		super();
		this.initialize();
	}

	private initialize(): void {
		// Check if Patent AI mode is enabled
		const isPatentMode = this.isPatentModeEnabled();

		if (isPatentMode) {
			this.logService.info('[Patent AI] 🎯 Patent AI backend integration ENABLED');

			// Validate configuration
			this.validateConfiguration();

			// Log authentication status
			this.logAuthenticationStatus();
		} else {
			this.logService.trace('[Patent AI] Patent AI mode disabled, using standard GitHub Copilot authentication');
		}
	}

	/**
	 * Check if Patent AI mode is enabled via configuration or environment variable
	 */
	private isPatentModeEnabled(): boolean {
		// Check environment variable first
		if (process.env.PATENT_AI_MODE === 'true') {
			return true;
		}

		// Check configuration setting via VSCode API
		try {
			const vscode = require('vscode');
			const config = vscode.workspace.getConfiguration();
			const configValue = config.get('patent.enabled', false) as boolean;
			return configValue;
		} catch {
			return false;
		}
	}

	/**
	 * Validate Patent AI configuration and log warnings if misconfigured
	 */
	private validateConfiguration(): void {
		const apiKey = this.getApiKey();
		const apiUrl = this.getApiUrl();

		if (!apiKey) {
			this.logService.warn('[Patent AI] ⚠️  API key not configured!');
			this.logService.warn('[Patent AI] Set one of:');
			this.logService.warn('[Patent AI]   - Environment: export PATENT_API_KEY="your-key"');
			this.logService.warn('[Patent AI]   - Settings: "patent.apiKey": "your-key"');
		} else {
			const maskedKey = this.maskApiKey(apiKey);
			this.logService.info(`[Patent AI] ✅ API key configured: ${maskedKey}`);
		}

		this.logService.info(`[Patent AI] 🌐 Backend URL: ${apiUrl}`);

		// Validate URL format
		try {
			new URL(apiUrl);
		} catch (error) {
			this.logService.error(`[Patent AI] ❌ Invalid backend URL: ${apiUrl}`);
			this.logService.error(`[Patent AI] Error: ${error}`);
		}
	}

	/**
	 * Log authentication status to confirm mock auth is working
	 */
	private logAuthenticationStatus(): void {
		const token = this.authService.copilotToken;

		if (token) {
			this.logService.info('[Patent AI] ✅ Mock authentication active');
			this.logService.info(`[Patent AI] User: ${token.username}`);
			this.logService.info(`[Patent AI] SKU: ${token.sku}`);
			this.logService.info(`[Patent AI] Chat enabled: ${token.isChatEnabled()}`);
			this.logService.info(`[Patent AI] Quota exceeded: ${token.isChatQuotaExceeded}`);
			this.logService.info(`[Patent AI] MCP enabled: ${token.isMcpEnabled()}`);
			this.logService.info(`[Patent AI] Agent enabled: ${token.codexAgentEnabled}`);
		} else {
			this.logService.warn('[Patent AI] ⚠️  No authentication token available yet');
		}
	}

	/**
	 * Get API key from environment or configuration
	 */
	private getApiKey(): string {
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
	 * Get API URL from environment or configuration
	 */
	private getApiUrl(): string {
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
	 * Mask API key for logging (show first 4 and last 4 characters)
	 */
	private maskApiKey(apiKey: string): string {
		if (apiKey.length <= 8) {
			return '****';
		}
		const first4 = apiKey.substring(0, 4);
		const last4 = apiKey.substring(apiKey.length - 4);
		const masked = '*'.repeat(Math.min(apiKey.length - 8, 12));
		return `${first4}${masked}${last4}`;
	}
}
