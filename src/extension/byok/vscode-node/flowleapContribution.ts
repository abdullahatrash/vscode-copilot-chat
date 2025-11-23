/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { lm } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { FlowLeapProvider } from './flowleapProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';

/**
 * Standalone contribution for FlowLeap provider
 * This registers independently of BYOK and doesn't require GitHub authentication
 */
export class FlowLeapContribution extends Disposable implements IExtensionContribution {
	public readonly id: string = 'flowleap-contribution';
	private readonly _byokStorageService: IBYOKStorageService;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
	) {
		super();

		this._logService.info('FlowLeap: Initializing FlowLeap contribution');

		// Create storage service for FlowLeap
		this._byokStorageService = new BYOKStorageService(extensionContext);

		// Register FlowLeap provider immediately
		this._registerFlowLeapProvider();
	}

	private _registerFlowLeapProvider() {
		try {
			this._logService.info('FlowLeap: Registering FlowLeap provider');

			// Create FlowLeap provider instance
			const flowleapProvider = this._instantiationService.createInstance(
				FlowLeapProvider,
				this._byokStorageService
			);

			// Register with VS Code Language Model API
			const registration = lm.registerLanguageModelChatProvider(
				FlowLeapProvider.providerName.toLowerCase(),
				flowleapProvider
			);

			// Track the registration for disposal
			this._register(registration);

			this._logService.info('FlowLeap: Provider registered successfully');
			this._logService.info(`FlowLeap: Provider available at: ${FlowLeapProvider.providerName.toLowerCase()}`);
		} catch (error) {
			this._logService.error('FlowLeap: Failed to register provider', error);
		}
	}
}
