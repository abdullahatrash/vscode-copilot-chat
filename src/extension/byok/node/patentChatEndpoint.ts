/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { isOpenAiFunctionTool } from '../../../platform/networking/common/fetch';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { createCapiRequestBody, IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { RawMessageConversionCallback } from '../../../platform/networking/common/openai';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

/**
 * Hydrate error messages for better user experience
 */
function hydratePatentErrorMessages(response: ChatResponse): ChatResponse {
	if (response.type === ChatFetchResponseType.Failed && response.streamError) {
		return {
			type: response.type,
			requestId: response.requestId,
			serverRequestId: response.serverRequestId,
			reason: JSON.stringify(response.streamError),
		};
	} else if (response.type === ChatFetchResponseType.RateLimited) {
		return {
			type: response.type,
			requestId: response.requestId,
			serverRequestId: response.serverRequestId,
			reason: response.capiError ? 'Rate limit exceeded\n\n' + JSON.stringify(response.capiError) : 'Rate limit exceeded',
			rateLimitKey: '',
			retryAfter: undefined,
			capiError: response.capiError
		};
	}
	return response;
}

/**
 * Custom endpoint for Patent AI backend.
 *
 * This endpoint bypasses GitHub Copilot API completely and connects directly
 * to your Patent AI backend at localhost:8000. It uses your custom API key
 * instead of GitHub authentication tokens.
 *
 * Key features:
 * - Uses Bearer token authentication with YOUR API key
 * - Points to YOUR backend URL (configurable)
 * - Supports OpenAI-compatible chat completions format
 * - Full streaming support
 * - Tool calling support
 * - No GitHub API dependencies
 */
export class PatentChatEndpoint extends ChatEndpoint {
	constructor(
		_modelMetadata: IChatModelInformation,
		protected readonly _patentApiKey: string,
		protected readonly _patentApiUrl: string,
		@IFetcherService fetcherService: IFetcherService,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAuthenticationService authService: IAuthenticationService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@ILogService protected logService: ILogService
	) {
		super(
			_modelMetadata,
			domainService,
			capiClientService,
			fetcherService,
			telemetryService,
			authService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configurationService,
			expService,
			logService
		);

		this.logService.info(`[Patent AI] Endpoint initialized with URL: ${_patentApiUrl}`);
	}

	/**
	 * Create request body compatible with OpenAI chat completions API
	 */
	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		if (this.useResponsesApi) {
			// Handle Responses API: customize the body directly
			options.ignoreStatefulMarker = false;
			const body = super.createRequestBody(options);
			body.store = true;
			body.n = undefined;
			body.stream_options = undefined;
			if (!this.modelMetadata.capabilities.supports.thinking) {
				body.reasoning = undefined;
				body.include = undefined;
			}
			if (body.previous_response_id && !body.previous_response_id.startsWith('resp_')) {
				// Don't use a response ID from CAPI
				body.previous_response_id = undefined;
			}
			return body;
		} else {
			// Handle CAPI: provide callback for thinking data processing
			const callback: RawMessageConversionCallback = (out, data) => {
				if (data && data.id) {
					out.cot_id = data.id;
					out.cot_summary = Array.isArray(data.text) ? data.text.join('') : data.text;
				}
			};
			const body = createCapiRequestBody(options, this.model, callback);
			return body;
		}
	}

	/**
	 * Intercept and modify request body before sending
	 * Ensures compatibility with OpenAI-compatible backends
	 */
	override interceptBody(body: IEndpointBody | undefined): void {
		super.interceptBody(body);

		// Remove empty tools array
		if (body?.tools?.length === 0) {
			delete body.tools;
		}

		// Ensure tool parameters have correct structure
		if (body?.tools) {
			body.tools = body.tools.map(tool => {
				if (isOpenAiFunctionTool(tool) && tool.function.parameters === undefined) {
					tool.function.parameters = { type: "object", properties: {} };
				}
				return tool;
			});
		}

		if (body) {
			// Handle thinking models
			if (this.modelMetadata.capabilities.supports.thinking) {
				delete body.temperature;
				body['max_completion_tokens'] = body.max_tokens;
				delete body.max_tokens;
			}

			// Remove max_tokens to use backend default (usually maximum)
			delete body.max_tokens;

			// Add stream_options for token usage tracking
			if (!this.useResponsesApi && body.stream) {
				body['stream_options'] = { 'include_usage': true };
			}
		}
	}

	/**
	 * Override to use custom Patent AI backend URL
	 * @returns The URL for your Patent AI backend
	 */
	override get urlOrRequestMetadata(): string {
		return this._patentApiUrl;
	}

	/**
	 * Override to use custom API key instead of GitHub token
	 * @returns Headers with Bearer token authentication using YOUR API key
	 */
	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this._patentApiKey}`,
			// Custom headers for Patent AI backend identification
			'X-Patent-AI-Client': 'vscode-copilot-chat',
			'X-Patent-AI-Version': '1.0.0',
		};

		this.logService.trace('[Patent AI] Request headers prepared (API key masked)');

		return headers;
	}

	/**
	 * Skip GitHub chat policy acceptance
	 * @returns Always true - no GitHub policy to accept
	 */
	override async acceptChatPolicy(): Promise<boolean> {
		return true;
	}

	/**
	 * Override model family for custom behavior
	 */
	public override readonly family: string = 'patent-ai';

	/**
	 * Clone endpoint with different token limits
	 * Used for context window management
	 */
	override cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		const newModelInfo = { ...this.modelMetadata, maxInputTokens: modelMaxPromptTokens };
		return this.instantiationService.createInstance(
			PatentChatEndpoint,
			newModelInfo,
			this._patentApiKey,
			this._patentApiUrl
		);
	}

	/**
	 * Make chat request to Patent AI backend
	 * Handles stateful marker validation and error hydration
	 */
	public override async makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		this.logService.debug('[Patent AI] Making chat request to backend');

		// Apply ignoreStatefulMarker: false for initial request
		const modifiedOptions: IMakeChatRequestOptions = { ...options, ignoreStatefulMarker: false };
		let response = await super.makeChatRequest2(modifiedOptions, token);

		// Retry with ignoreStatefulMarker if invalid
		if (response.type === ChatFetchResponseType.InvalidStatefulMarker) {
			this.logService.debug('[Patent AI] Retrying request with ignoreStatefulMarker=true');
			response = await this._makeChatRequest2({ ...options, ignoreStatefulMarker: true }, token);
		}

		// Hydrate error messages for better UX
		const hydratedResponse = hydratePatentErrorMessages(response);

		if (hydratedResponse.type === ChatFetchResponseType.Success) {
			this.logService.debug('[Patent AI] Chat request successful');
		} else {
			this.logService.warn(`[Patent AI] Chat request failed with type: ${hydratedResponse.type}`);
		}

		return hydratedResponse;
	}
}
