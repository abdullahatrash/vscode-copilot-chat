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

interface ISearchPatentsParams {
	query: string;
	range?: string;
}

interface PatentDoc {
	docId: string;
	title: string | null;
	abstract: string | null;
	applicants: string[];
	publicationDate: string | null;
}

interface PatentSearchResult {
	success: boolean;
	total?: number;
	range?: {
		begin: number;
		end: number;
	};
	docs?: PatentDoc[];
	query?: string;
	error?: string;
}

/**
 * Tool for searching patent databases using CQL (Common Patent Query Language).
 * Calls the Patent AI backend which handles EPO OPS API authentication.
 */
class SearchPatentsTool implements ICopilotTool<ISearchPatentsParams> {

	public static readonly toolName = ToolName.SearchPatents;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<ISearchPatentsParams>, _token: CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { query } = _options.input;
		return {
			invocationMessage: l10n.t`Searching patents: ${query}`,
			confirmationMessages: {
				title: l10n.t`Search Patents`,
				message: l10n.t`Allow Patent AI to search for patents using query: ${query}?`
			}
		};
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISearchPatentsParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		console.log('[SearchPatentsTool] ========== TOOL INVOKED ==========');
		console.log('[SearchPatentsTool] Input:', options.input);
		this.logService.trace('[SearchPatentsTool] Invoking patent search');

		const { query, range = '1-25' } = options.input;

		try {
			// Get backend URL from environment
			const backendUrl = process.env.PATENT_API_URL || 'http://localhost:8000/v1/chat/completions';
			// Extract base URL (remove /v1/chat/completions if present)
			const baseUrl = backendUrl.replace('/v1/chat/completions', '');
			const patentSearchUrl = `${baseUrl}/v1/patent-search`;

			console.log('[SearchPatentsTool] Calling backend:', patentSearchUrl);
			this.logService.info(`[SearchPatentsTool] Calling backend: ${patentSearchUrl}`);

			const response = await fetch(patentSearchUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ query, range }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[SearchPatentsTool] Backend error:', response.status, errorText);
				this.logService.error(`[SearchPatentsTool] Backend error: ${response.status} ${errorText}`);
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Error: Patent search backend returned ${response.status}: ${errorText}`)
				]);
			}

			const result = await response.json() as PatentSearchResult;

			console.log('[SearchPatentsTool] Search result:', JSON.stringify(result, null, 2));
			this.logService.info(`[SearchPatentsTool] Search result: ${JSON.stringify(result, null, 2)}`);

			if (!result.success) {
				console.error('[SearchPatentsTool] Search failed:', result.error);
				this.logService.error('[SearchPatentsTool] Search failed:', result.error);
				return new LanguageModelToolResult([
					new LanguageModelTextPart(`Error searching patents: ${result.error}`)
				]);
			}

			// Format results for LLM
			const formattedResponse = this.formatSearchResults(result);
			console.log(`[SearchPatentsTool] Formatted response length: ${formattedResponse.length} chars`);
			this.logService.info(`[SearchPatentsTool] Formatted response length: ${formattedResponse.length} chars`);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(formattedResponse)
			]);

		} catch (error) {
			console.error('[SearchPatentsTool] Exception:', error);
			this.logService.error('[SearchPatentsTool] Exception:', error);
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
			]);
		}
	}

	/**
	 * Format search results for LLM consumption
	 */
	private formatSearchResults(result: PatentSearchResult): string {
		if (!result.success || !result.docs || result.docs.length === 0) {
			return `No patents found for query: ${result.query}`;
		}

		const lines: string[] = [
			`Found ${result.total} patents matching query: "${result.query}"`,
			`Showing results ${result.range?.begin}-${result.range?.end}:`,
			''
		];

		for (const doc of result.docs) {
			lines.push(`${doc.docId}`);

			if (doc.title) {
				lines.push(`  Title: ${doc.title}`);
			}

			if (doc.applicants && doc.applicants.length > 0) {
				lines.push(`  Applicants: ${doc.applicants.join(', ')}`);
			}

			if (doc.publicationDate) {
				lines.push(`  Published: ${doc.publicationDate}`);
			}

			if (doc.abstract) {
				// Truncate abstract to first 200 chars for readability
				const abstractPreview = doc.abstract.length > 200
					? doc.abstract.substring(0, 200) + '...'
					: doc.abstract;
				lines.push(`  Abstract: ${abstractPreview}`);
			}

			lines.push(''); // Empty line between patents
		}

		lines.push('Note: Use these patent document IDs to fetch detailed information (full claims, descriptions, etc.) if needed.');

		return lines.join('\n');
	}
}

ToolRegistry.registerTool(SearchPatentsTool);
