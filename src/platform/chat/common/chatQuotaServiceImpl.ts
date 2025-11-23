/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHeaders } from '../../networking/common/fetcherService';
import { IChatQuotaService } from './chatQuotaService';

export class ChatQuotaService implements IChatQuotaService {
	readonly _serviceBrand: undefined;

	// FlowLeap Patent IDE: No quota limits for patent work
	quotaExhausted = false;
	overagesEnabled = true;

	processQuotaHeaders(headers: IHeaders): void {
		// No-op: quota management removed for patent IDE
	}

	clearQuota(): void {
		// No-op: quota management removed for patent IDE
	}
}
