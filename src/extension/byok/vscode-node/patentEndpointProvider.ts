/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChat, type ChatRequest } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { ChatEndpointFamily, EmbeddingsEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { EmbeddingEndpoint } from '../../../platform/endpoint/node/embeddingsEndpoint';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../platform/networking/common/networking';
import { IRequestLogger } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { TokenizerType } from '../../../util/common/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PatentChatEndpoint } from '../node/patentChatEndpoint';

/**
 * Custom endpoint provider for Patent AI backend.
 *
 * This provider bypasses GitHub's CAPI completely and returns Patent AI endpoints.
 * It provides a single, hardcoded model configuration that points to your custom backend.
 */
export class PatentEndpointProvider implements IEndpointProvider {

	declare readonly _serviceBrand: undefined;

	private _chatEndpoint: IChatEndpoint | undefined;
	private _embeddingEndpoint: IEmbeddingsEndpoint | undefined;
	private readonly _patentApiKey: string;
	private readonly _patentApiUrl: string;

	constructor(
		_collectFetcherTelemetry: unknown,
		@ICAPIClientService _capiClientService: ICAPIClientService,
		@IFetcherService _fetcher: IFetcherService,
		@IExperimentationService _expService: IExperimentationService,
		@ITelemetryService _telemetryService: ITelemetryService,
		@ILogService protected readonly _logService: ILogService,
		@IConfigurationService _configService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IEnvService _envService: IEnvService,
		@IAuthenticationService protected readonly _authService: IAuthenticationService,
		@IRequestLogger _requestLogger: IRequestLogger
	) {
		// Get Patent AI configuration
		this._patentApiKey = this.getPatentApiKey();
		this._patentApiUrl = this.getPatentApiUrl();

		this._logService.info('[Patent AI] Endpoint provider initialized');
		this._logService.info(`[Patent AI] Backend URL: ${this._patentApiUrl}`);
		this._logService.info(`[Patent AI] API Key: ${this.maskApiKey(this._patentApiKey)}`);
	}

	/**
	 * Get Patent AI API key from environment or config
	 */
	private getPatentApiKey(): string {
		if (process.env.PATENT_API_KEY) {
			return process.env.PATENT_API_KEY;
		}

		try {
			const vscode = require('vscode');
			const config = vscode.workspace.getConfiguration();
			return config.get('patent.apiKey', 'test-api-key') as string;
		} catch {
			return 'test-api-key';
		}
	}

	/**
	 * Get Patent AI API URL from environment or config
	 * Can be either base URL (http://localhost:8000) or full URL (http://localhost:8000/v1/chat/completions)
	 */
	private getPatentApiUrl(): string {
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
	 * Mask API key for logging
	 */
	private maskApiKey(apiKey: string): string {
		if (apiKey.length <= 8) {
			return '****';
		}
		const first4 = apiKey.substring(0, 4);
		const last4 = apiKey.substring(apiKey.length - 4);
		return `${first4}****${last4}`;
	}

	/**
	 * Get Patent AI model metadata (hardcoded)
	 */
	private getPatentModelMetadata(): IChatModelInformation {
		return {
			id: 'patent-gpt-4',
			name: 'Patent AI GPT-4',
			version: '1.0.0',
			model_picker_enabled: true,
			is_chat_default: true,
			is_chat_fallback: false,
			capabilities: {
				supports: {
					streaming: true,
					tool_calls: true,
					vision: false,
					prediction: false
				},
				tokenizer: TokenizerType.O200K,
				family: 'patent-ai',
				type: 'chat',
				limits: {
					max_prompt_tokens: 128000,
					max_output_tokens: 16384
				}
			}
		};
	}

	/**
	 * Get or create the Patent AI chat endpoint
	 */
	private getOrCreatePatentChatEndpoint(): IChatEndpoint {
		if (!this._chatEndpoint) {
			const modelMetadata = this.getPatentModelMetadata();
			// Append /v1/chat/completions to base URL if not already present
			let chatUrl = this._patentApiUrl;
			if (!chatUrl.endsWith('/v1/chat/completions')) {
				chatUrl = `${chatUrl}/v1/chat/completions`;
			}
			this._chatEndpoint = this._instantiationService.createInstance(
				PatentChatEndpoint,
				modelMetadata,
				this._patentApiKey,
				chatUrl
			);
			this._logService.info(`[Patent AI] Chat endpoint created with URL: ${chatUrl}`);
		}
		return this._chatEndpoint;
	}

	/**
	 * Get chat endpoint for any request
	 * Always returns the Patent AI endpoint regardless of model requested
	 */
	async getChatEndpoint(_requestOrFamilyOrModel?: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		this._logService.trace('[Patent AI] Resolving chat endpoint');
		const endpoint = this.getOrCreatePatentChatEndpoint();
		this._logService.trace('[Patent AI] Chat endpoint resolved');
		return endpoint;
	}

	/**
	 * Get embeddings endpoint (mock - not used in chat)
	 */
	async getEmbeddingsEndpoint(_family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		this._logService.trace('[Patent AI] Resolving embeddings endpoint (mock)');

		if (!this._embeddingEndpoint) {
			// Create a mock embedding endpoint
			const mockEmbeddingModel: IEmbeddingModelInformation = {
				id: 'patent-embeddings',
				name: 'Patent AI Embeddings',
				version: '1.0.0',
				model_picker_enabled: false,
				is_chat_default: false,
				is_chat_fallback: false,
				capabilities: {
					tokenizer: TokenizerType.O200K,
					family: 'patent-ai',
					type: 'embeddings',
					limits: {
						max_inputs: 8192
					}
				}
			};
			this._embeddingEndpoint = this._instantiationService.createInstance(EmbeddingEndpoint, mockEmbeddingModel);
		}

		return this._embeddingEndpoint;
	}

	/**
	 * Get all completion models (returns empty array - not used for chat)
	 */
	async getAllCompletionModels(_forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		// Return empty array - we only support chat models, not completion models
		return [];
	}

	/**
	 * Get all chat endpoints (returns single Patent AI endpoint)
	 */
	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return [this.getOrCreatePatentChatEndpoint()];
	}
}
