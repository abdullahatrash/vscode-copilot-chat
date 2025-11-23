/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { IHeaders } from '../../networking/common/fetcherService';

export interface IChatQuotaService {
	readonly _serviceBrand: undefined;
	quotaExhausted: boolean;
	overagesEnabled: boolean;
	processQuotaHeaders(headers: IHeaders): void;
	clearQuota(): void;
}

export const IChatQuotaService = createServiceIdentifier<IChatQuotaService>('IChatQuotaService');
