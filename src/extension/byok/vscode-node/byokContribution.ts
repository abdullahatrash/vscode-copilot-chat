/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, LanguageModelChatInformation, lm } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels, BYOKModelProvider, isBYOKEnabled } from '../../byok/common/byokProvider';
import { IExtensionContribution } from '../../common/contributions';
import { AnthropicLMProvider } from './anthropicProvider';
import { AzureBYOKModelProvider } from './azureProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { CustomOAIModelConfigurator } from './customOAIModelConfigurator';
import { CustomOAIBYOKModelProvider } from './customOAIProvider';
import { GeminiNativeBYOKLMProvider } from './geminiNativeProvider';
import { GroqBYOKLMProvider } from './groqProvider';
import { OllamaLMProvider } from './ollamaProvider';
import { OAIBYOKLMProvider } from './openAIProvider';
import { OpenRouterLMProvider } from './openRouterProvider';
import { XAIBYOKLMProvider } from './xAIProvider';
import { FlowLeapProvider } from './flowleapProvider';

export class BYOKContrib extends Disposable implements IExtensionContribution {
	public readonly id: string = 'byok-contribution';
	private readonly _byokStorageService: IBYOKStorageService;
	private readonly _providers: Map<string, BYOKModelProvider<LanguageModelChatInformation>> = new Map();
	private _byokProvidersRegistered = false;

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@IAuthenticationService authService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		console.log('[BYOKContrib] Constructor called - starting BYOK provider registration');

		// Register stub command for Patent AI mode (VS Code core expects this command)
		this._register(commands.registerCommand('workbench.action.chat.triggerSetup', async () => {
			this._logService.info('[Patent AI] Chat setup command triggered - no action needed in Patent AI mode');
			// In Patent AI mode, no GitHub setup needed. FlowLeap provider is already active.
		}));

		this._register(commands.registerCommand('github.copilot.chat.manageBYOK', async (vendor: string) => {
			const provider = this._providers.get(vendor);

			// Show quick pick for Azure and CustomOAI providers
			if (provider && (vendor === AzureBYOKModelProvider.providerName.toLowerCase() || vendor === CustomOAIBYOKModelProvider.providerName.toLowerCase())) {
				const configurator = new CustomOAIModelConfigurator(this._configurationService, vendor, provider);
				await configurator.configureModelOrUpdateAPIKey();
			} else if (provider) {
				// For all other providers, directly go to API key management
				await provider.updateAPIKey();
			}
		}));

		this._register(commands.registerCommand('github.copilot.chat.manageBYOKAPIKey', async (vendor: string, envVarName: string, action?: 'update' | 'remove', modelId?: string) => {
			const provider = this._providers.get(vendor);
			if (!provider) {
				this._logService.error(`BYOK: Provider ${vendor} not found`);
				return;
			}

			try {
				if (provider.updateAPIKeyViaCmd) {
					await provider.updateAPIKeyViaCmd(envVarName, action ?? 'update', modelId);
				} else {
					this._logService.error(`BYOK: Provider ${vendor} does not support API key management via command`);
				}
			} catch (error) {
				this._logService.error(`BYOK: Failed to ${action || 'update'} API key for provider ${vendor}${modelId ? ` and model ${modelId}` : ''}`, error);
				throw error;
			}
		}));

		this._byokStorageService = new BYOKStorageService(extensionContext);

		// Register FlowLeap provider immediately (no auth required)
		this._registerFlowLeapProvider(this._instantiationService);

		this._authChange(authService, this._instantiationService);

		this._register(authService.onDidAuthenticationChange(() => {
			this._authChange(authService, this._instantiationService);
		}));
	}

	private _registerFlowLeapProvider(instantiationService: IInstantiationService) {
		// Register FlowLeap provider without requiring Copilot token
		console.log('[BYOKContrib] Registering FlowLeap provider');
		this._logService.info('FlowLeap: Registering FlowLeap provider');
		const flowleapProvider = instantiationService.createInstance(FlowLeapProvider, this._byokStorageService);
		this._providers.set(FlowLeapProvider.providerName.toLowerCase(), flowleapProvider);
		this._store.add(lm.registerLanguageModelChatProvider(FlowLeapProvider.providerName.toLowerCase(), flowleapProvider));
		console.log('[BYOKContrib] FlowLeap provider registered successfully with vendor:', FlowLeapProvider.providerName.toLowerCase());
		this._logService.info('FlowLeap: Provider registered successfully');

		// Trigger immediate model resolution so models appear in model picker
		// VS Code's language model service only resolves models on-demand, but we want FlowLeap
		// models to be available immediately when the chat panel opens
		console.log('[BYOKContrib] Triggering FlowLeap model resolution');
		lm.selectChatModels({ vendor: FlowLeapProvider.providerName.toLowerCase() }).then(models => {
			console.log('[BYOKContrib] FlowLeap models resolved:', models.length, 'models found');
			models.forEach(m => console.log('[BYOKContrib] Available model:', m.name, '(' + m.id + ')'));
		}).catch(err => {
			console.error('[BYOKContrib] Failed to resolve FlowLeap models:', err);
		});
	}

	private async _authChange(authService: IAuthenticationService, instantiationService: IInstantiationService) {
		if (authService.copilotToken && isBYOKEnabled(authService.copilotToken, this._capiClientService) && !this._byokProvidersRegistered) {
			this._byokProvidersRegistered = true;
			// Update known models list from CDN so all providers have the same list
			const knownModels = await this.fetchKnownModelList(this._fetcherService);
			this._providers.set(OllamaLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OllamaLMProvider, this._configurationService.getConfig(ConfigKey.OllamaEndpoint), this._byokStorageService));
			this._providers.set(AnthropicLMProvider.providerName.toLowerCase(), instantiationService.createInstance(AnthropicLMProvider, knownModels[AnthropicLMProvider.providerName], this._byokStorageService));
			this._providers.set(GroqBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(GroqBYOKLMProvider, knownModels[GroqBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(GeminiNativeBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(GeminiNativeBYOKLMProvider, knownModels[GeminiNativeBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(XAIBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(XAIBYOKLMProvider, knownModels[XAIBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(OAIBYOKLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OAIBYOKLMProvider, knownModels[OAIBYOKLMProvider.providerName], this._byokStorageService));
			this._providers.set(OpenRouterLMProvider.providerName.toLowerCase(), instantiationService.createInstance(OpenRouterLMProvider, this._byokStorageService));
			this._providers.set(AzureBYOKModelProvider.providerName.toLowerCase(), instantiationService.createInstance(AzureBYOKModelProvider, this._byokStorageService));
			this._providers.set(CustomOAIBYOKModelProvider.providerName.toLowerCase(), instantiationService.createInstance(CustomOAIBYOKModelProvider, this._byokStorageService));

			for (const [providerName, provider] of this._providers) {
				this._store.add(lm.registerLanguageModelChatProvider(providerName, provider));
			}
		}
	}
	private async fetchKnownModelList(fetcherService: IFetcherService): Promise<Record<string, BYOKKnownModels>> {
		const data = await (await fetcherService.fetch('https://main.vscode-cdn.net/extensions/copilotChat.json', { method: "GET" })).json();
		let knownModels: Record<string, BYOKKnownModels>;
		if (data.version !== 1) {
			this._logService.warn('BYOK: Copilot Chat known models list is not in the expected format. Defaulting to empty list.');
			knownModels = {};
		} else {
			knownModels = data.modelInfo;
		}
		this._logService.info('BYOK: Copilot Chat known models list fetched successfully.');
		return knownModels;
	}
}