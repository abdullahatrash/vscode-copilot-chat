/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

interface PatentSearchInput {
	query: string;
	database?: 'uspto' | 'epo' | 'wipo' | 'all';
	limit?: number;
}

export class PatentSearchTool implements vscode.LanguageModelTool<PatentSearchInput> {
	name = 'patent_search';
	description = 'Search patent databases (USPTO, EPO, WIPO) for prior art';

	inputSchema = {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Search query (keywords, IPC classes, or patent numbers)'
			},
			database: {
				type: 'string',
				enum: ['uspto', 'epo', 'wipo', 'all'],
				description: 'Which patent database to search'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results',
				default: 10
			}
		},
		required: ['query']
	};

	async invoke(options: vscode.LanguageModelToolInvocationOptions<PatentSearchInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;
		const apiUrl = vscode.workspace.getConfiguration('flowleap').get('apiUrl') || 'http://localhost:8000';

		try {
			const response = await fetch(`${apiUrl}/api/patent/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: input.query,
					database: input.database || 'all',
					limit: input.limit || 10
				})
			});

			if (!response.ok) {
				throw new Error(`Patent search failed: ${response.statusText}`);
			}

			const results = await response.json() as { patents?: any[]; count?: number };

			const resultText = JSON.stringify({
				results: results.patents || [],
				count: results.count || 0,
				query: input.query,
				database: input.database || 'all'
			}, null, 2);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(resultText)
			]);
		} catch (error: any) {
			const errorText = JSON.stringify({
				error: `Patent search failed: ${error?.message || 'Unknown error'}`,
				results: [],
				count: 0
			}, null, 2);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(errorText)
			]);
		}
	}
}
