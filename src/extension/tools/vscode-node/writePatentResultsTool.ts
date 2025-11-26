/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ILogService } from '../../../platform/log/common/logService';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

interface IWritePatentResultsParams {
	filePath: string;
	content: string;
}

/**
 * Simple tool for writing patent search results to files
 * Does not require GitHub Copilot authentication
 */
class WritePatentResultsTool implements ICopilotTool<IWritePatentResultsParams> {

	public static readonly toolName = ToolName.WritePatentResults;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<IWritePatentResultsParams>, _token: CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { filePath } = _options.input;
		return {
			invocationMessage: l10n.t`Writing patent results to ${filePath}`,
			confirmationMessages: {
				title: l10n.t`Write Patent Results`,
				message: l10n.t`Allow Patent AI to write search results to ${filePath}?`
			}
		};
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IWritePatentResultsParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		console.log('[WritePatentResultsTool] ========== TOOL INVOKED ==========');
		console.log('[WritePatentResultsTool] Input:', options.input);
		this.logService.trace('[WritePatentResultsTool] Invoking write patent results');

		const { filePath, content } = options.input;

		try {
			// Ensure directory exists
			const directory = path.dirname(filePath);
			if (!fs.existsSync(directory)) {
				fs.mkdirSync(directory, { recursive: true });
				this.logService.info(`[WritePatentResultsTool] Created directory: ${directory}`);
			}

			// Write file
			fs.writeFileSync(filePath, content, 'utf8');

			console.log('[WritePatentResultsTool] Successfully wrote file:', filePath);
			this.logService.info(`[WritePatentResultsTool] Successfully wrote file: ${filePath}`);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Successfully wrote patent results to ${filePath}`)
			]);

		} catch (error) {
			this.logService.error('[WritePatentResultsTool] Exception:', error);
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
			]);
		}
	}
}

ToolRegistry.registerTool(WritePatentResultsTool);
