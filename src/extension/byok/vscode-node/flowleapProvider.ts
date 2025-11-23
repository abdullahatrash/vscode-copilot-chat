/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKAuthType, BYOKKnownModels } from '../common/byokProvider';
import { BaseOpenAICompatibleLMProvider } from './baseOpenAICompatibleProvider';
import { IBYOKStorageService } from './byokStorageService';

export class FlowLeapProvider extends BaseOpenAICompatibleLMProvider {
	public static readonly providerName = 'FlowLeap';

	constructor(
		byokStorageService: IBYOKStorageService,
		@IFetcherService _fetcherService: IFetcherService,
		@ILogService _logService: ILogService,
		@IInstantiationService _instantiationService: IInstantiationService,
	) {
		// FlowLeap API URL - for now hardcoded, can be made configurable later
		const apiUrl = 'http://localhost:8000/v1';

		// FlowLeap known models - defining our patent GPT model
		const knownModels: BYOKKnownModels = {
			'flowleap-patent-gpt': {
				name: 'FlowLeap Patent GPT',
				maxInputTokens: 128000,
				maxOutputTokens: 16384,
				toolCalling: true,
				vision: false,
			},
		};

		super(
			BYOKAuthType.None, // No API key required for initial testing
			FlowLeapProvider.providerName,
			apiUrl,
			knownModels,
			byokStorageService,
			_fetcherService,
			_logService,
			_instantiationService,
		);
	}

	protected override async getAllModels(): Promise<BYOKKnownModels> {
		// Return our known models without fetching from server
		// (since we control what models FlowLeap offers)
		console.log('[FlowLeap] getAllModels() called - returning patent-gpt model');
		return {
			'flowleap-patent-gpt': {
				name: 'FlowLeap Patent GPT',
				maxInputTokens: 128000,
				maxOutputTokens: 16384,
				toolCalling: true,
				vision: false,
			},
		};
	}

	// Override to add logging
	async provideLanguageModelChatInformation(options: { silent: boolean }, token: any): Promise<any[]> {
		console.log('[FlowLeap] provideLanguageModelChatInformation() called, silent:', options.silent);
		const models = await super.provideLanguageModelChatInformation(options, token);
		console.log('[FlowLeap] Returning', models.length, 'models');
		models.forEach((m: any) => {
			console.log('[FlowLeap] Model:', JSON.stringify({
				id: m.id,
				name: m.name,
				family: m.family,
				vendor: m.vendor,
				isUserSelectable: m.isUserSelectable,
				isDefault: m.isDefault,
				maxInputTokens: m.maxInputTokens,
				maxOutputTokens: m.maxOutputTokens
			}, null, 2));
		});
		return models;
	}
}
