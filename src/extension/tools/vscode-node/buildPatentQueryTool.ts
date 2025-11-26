/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

interface IBuildPatentQueryParams {
	description: string;
	focus?: 'broad' | 'precise' | 'comprehensive';
}

interface QueryStrategy {
	recommended_cql: string;
	explanation: string;
	search_fields_used: string[];
	alternatives?: {
		broader?: string;
		narrower?: string;
	};
	tips?: string[];
}

interface BuildQueryResult {
	success: boolean;
	strategy?: QueryStrategy;
	error?: string;
}

/**
 * Tool for building optimized CQL queries from natural language descriptions.
 * This tool analyzes the user's intent and constructs effective patent search queries.
 * Should be called BEFORE searchPatents to ensure good search strategy.
 */
class BuildPatentQueryTool implements ICopilotTool<IBuildPatentQueryParams> {

	public static readonly toolName = ToolName.BuildPatentQuery;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<IBuildPatentQueryParams>, _token: CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { description } = _options.input;
		return {
			invocationMessage: l10n.t`Building patent search strategy: ${description}`,
		};
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IBuildPatentQueryParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		console.log('[BuildPatentQueryTool] ========== TOOL INVOKED ==========');
		console.log('[BuildPatentQueryTool] Input:', options.input);
		this.logService.trace('[BuildPatentQueryTool] Building query strategy');

		const { description, focus = 'comprehensive' } = options.input;

		try {
			// Get backend URL from environment
			const backendUrl = process.env.PATENT_API_URL || 'http://localhost:8000/v1/chat/completions';
			// Extract base URL (remove /v1/chat/completions if present)
			const baseUrl = backendUrl.replace('/v1/chat/completions', '');
			const buildQueryUrl = `${baseUrl}/v1/build-patent-query`;

			console.log('[BuildPatentQueryTool] Calling backend:', buildQueryUrl);
			this.logService.info(`[BuildPatentQueryTool] Calling backend: ${buildQueryUrl}`);

			const response = await fetch(buildQueryUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ description, focus }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[BuildPatentQueryTool] Backend error:', response.status, errorText);
				this.logService.error(`[BuildPatentQueryTool] Backend error: ${response.status} ${errorText}`);
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Error: Patent query builder returned ${response.status}: ${errorText}`)
				]);
			}

			const result = await response.json() as BuildQueryResult;

			console.log('[BuildPatentQueryTool] Strategy result:', JSON.stringify(result, null, 2));
			this.logService.info(`[BuildPatentQueryTool] Strategy result: ${JSON.stringify(result, null, 2)}`);

			if (!result.success || !result.strategy) {
				console.error('[BuildPatentQueryTool] Strategy building failed:', result.error);
				this.logService.error('[BuildPatentQueryTool] Strategy building failed:', result.error);
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Error building query strategy: ${result.error}`)
				]);
			}

			// Format strategy for LLM
			const formattedResponse = this.formatStrategy(result.strategy);
			console.log(`[BuildPatentQueryTool] Formatted response length: ${formattedResponse.length} chars`);
			this.logService.info(`[BuildPatentQueryTool] Formatted response length: ${formattedResponse.length} chars`);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(formattedResponse)
			]);

		} catch (error) {
			console.error('[BuildPatentQueryTool] Exception:', error);
			this.logService.error('[BuildPatentQueryTool] Exception:', error);
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
			]);
		}
	}

	/**
	 * Format strategy for LLM consumption
	 */
	private formatStrategy(strategy: QueryStrategy): string {
		const lines: string[] = [
			'## Patent Search Strategy',
			'',
			'### Recommended CQL Query',
			'```',
			strategy.recommended_cql,
			'```',
			'',
			'### Explanation',
			strategy.explanation,
			'',
			'### Search Fields Used',
			strategy.search_fields_used.map(f => `- ${f}`).join('\n'),
		];

		if (strategy.alternatives) {
			lines.push('', '### Alternative Queries');
			if (strategy.alternatives.broader) {
				lines.push(`**Broader search:** \`${strategy.alternatives.broader}\``);
			}
			if (strategy.alternatives.narrower) {
				lines.push(`**Narrower search:** \`${strategy.alternatives.narrower}\``);
			}
		}

		if (strategy.tips && strategy.tips.length > 0) {
			lines.push('', '### Tips');
			lines.push(strategy.tips.map(t => `- ${t}`).join('\n'));
		}

		lines.push('', '---', 'Use the recommended CQL query with the search_patents tool to execute the search.');

		return lines.join('\n');
	}
}

ToolRegistry.registerTool(BuildPatentQueryTool);
