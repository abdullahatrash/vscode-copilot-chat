/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { GITHUB_SCOPE_ALIGNED, IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { CopilotToken, ExtendedTokenInfo } from '../../../platform/authentication/common/copilotToken';
import { Emitter, Event } from '../../../util/vs/base/common/event';

/**
 * Mock authentication service for Patent AI backend.
 *
 * This service bypasses GitHub authentication entirely by returning a mock CopilotToken
 * with all features enabled. The agent code will check this token and enable all features
 * without making any GitHub API calls.
 *
 * Key behaviors:
 * - Always returns "authenticated" status
 * - Mock token has unlimited quotas
 * - All features enabled (chat, tools, MCP, etc.)
 * - No actual network calls to GitHub
 * - Permissive scopes (full repository access simulation)
 */
export class PatentAuthenticationService implements IAuthenticationService {
	readonly _serviceBrand: undefined;

	private _mockToken: CopilotToken;
	private _mockSession: AuthenticationSession;

	private readonly _onDidAuthenticationChange = new Emitter<void>();
	readonly onDidAuthenticationChange: Event<void> = this._onDidAuthenticationChange.event;

	private readonly _onDidAccessTokenChange = new Emitter<void>();
	readonly onDidAccessTokenChange: Event<void> = this._onDidAccessTokenChange.event;

	private readonly _onDidAdoAuthenticationChange = new Emitter<void>();
	readonly onDidAdoAuthenticationChange: Event<void> = this._onDidAdoAuthenticationChange.event;

	constructor() {
		console.log('[Patent AI Auth] Constructor called - initializing mock authentication');

		// Create mock GitHub session with full permissive scopes
		this._mockSession = {
			id: 'patent-ai-session',
			accessToken: 'mock-github-token-not-used-by-custom-endpoint',
			account: {
				id: 'patent-ai-user',
				label: 'Patent AI User'
			},
			scopes: GITHUB_SCOPE_ALIGNED // ['read:user', 'user:email', 'repo', 'workflow']
		};

		// Create mock Copilot token with ALL features enabled
		this._mockToken = this.createMockToken();
		console.log('[Patent AI Auth] Mock token created:', {
			username: this._mockToken.username,
			sku: this._mockToken.sku,
			chatEnabled: this._mockToken.isChatEnabled(),
			quotaExceeded: this._mockToken.isChatQuotaExceeded
		});

		// Note: We don't need to fire onDidAuthenticationChange here because
		// ConversationFeature checks authenticationService.copilotToken synchronously
		// during its construction. The token is already available via the copilotToken getter.
		// If needed in the future, we could fire the event like this:
		// process.nextTick(() => this._onDidAuthenticationChange.fire());
	}

	//#region IAuthenticationService implementation

	/**
	 * Always return false - we're not in minimal mode
	 * This ensures the agent has full permissions
	 */
	get isMinimalMode(): boolean {
		return false;
	}

	/**
	 * Return mock GitHub session
	 * This satisfies agent code that checks for authentication
	 */
	get anyGitHubSession(): AuthenticationSession | undefined {
		return this._mockSession;
	}

	/**
	 * Return mock GitHub session asynchronously
	 */
	async getAnyGitHubSession(_options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		return this._mockSession;
	}

	/**
	 * Return mock permissive session
	 * Same as anyGitHubSession since we always have full permissions
	 */
	get permissiveGitHubSession(): AuthenticationSession | undefined {
		return this._mockSession;
	}

	/**
	 * Return mock permissive session asynchronously
	 * Never throws MinimalModeError since isMinimalMode is false
	 */
	async getPermissiveGitHubSession(_options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		return this._mockSession;
	}

	/**
	 * Return mock Copilot token (without token field for security)
	 */
	get copilotToken(): Omit<CopilotToken, 'token'> | undefined {
		console.log('[Patent AI Auth] copilotToken getter accessed, isChatEnabled:', this._mockToken?.isChatEnabled());
		return this._mockToken;
	}

	/**
	 * Return mock Copilot token asynchronously
	 * Never expires, never needs refresh
	 */
	async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return this._mockToken;
	}

	/**
	 * No-op for token reset
	 * Mock token never needs to be reset
	 */
	resetCopilotToken(_httpError?: number): void {
		// No-op - token never expires or becomes invalid
	}

	/**
	 * Speculative decoding not used
	 */
	get speculativeDecodingEndpointToken(): string | undefined {
		return undefined;
	}

	/**
	 * Azure DevOps not supported in Patent AI mode
	 */
	async getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		return undefined;
	}

	//#endregion

	/**
	 * Create a mock CopilotToken with all features enabled
	 *
	 * This token structure mirrors what GitHub Copilot API would return,
	 * but with all feature flags enabled and no quotas/restrictions.
	 */
	private createMockToken(): CopilotToken {
		const mockTokenInfo: ExtendedTokenInfo = {
			// Token string in "fields:mac" format
			// The fields are parsed by CopilotToken to enable features
			token: 'patent_ai=1;chat=1;tools=1;mcp=1;editor_preview_features=1:mock_signature',

			// Expiration - set to 24 hours from now
			// Will be considered valid without refresh
			expires_at: Math.floor(Date.now() / 1000) + 86400,
			refresh_in: 3600,

			// User identity
			username: 'patent-ai-user',
			sku: 'patent_ai_enterprise', // Custom SKU for Patent AI
			copilot_plan: 'enterprise',  // Highest tier

			// Organization membership (empty - not using GitHub orgs)
			organization_list: [],
			enterprise_list: [],

			// ✅ CORE FEATURES - ALL ENABLED
			chat_enabled: true,                      // Enable chat interface
			copilotignore_enabled: false,            // Not using .copilotignore files
			code_quote_enabled: false,               // No code citation tracking
			public_suggestions: 'enabled',           // Allow code suggestions
			telemetry: 'disabled' as any,            // No telemetry to GitHub (type workaround)

			// ✅ QUOTAS - UNLIMITED
			// undefined means no quota restrictions
			limited_user_quotas: undefined,
			quota_snapshots: undefined,
			quota_reset_date: undefined,

			// Mock endpoints (not used by custom PatentChatEndpoint)
			endpoints: {
				api: 'http://localhost:8000',
				proxy: 'http://localhost:8000',
				telemetry: '' // Empty string since telemetry is not used
			},

			// User flags
			individual: false,                       // Not individual plan (enterprise)
			isVscodeTeamMember: false,               // Not VSCode team

			// ✅ ADVANCED FEATURES - ALL ENABLED
			blackbird_clientside_indexing: true,     // Enable local codebase indexing
			codex_agent_enabled: true,               // Enable agent features
		};

		return new CopilotToken(mockTokenInfo);
	}
}
