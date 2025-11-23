/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const TELEMETRY_SEND_INTERVAL = 0;

export function wrapEventNameForPrefixRemoval(eventName: string): string {
	// No-op: just return the event name as-is (telemetry removed)
	return eventName;
}

export class AzureInsightsReporter {
	// No-op: telemetry removed for patent IDE
}
