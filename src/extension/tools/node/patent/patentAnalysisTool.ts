/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';

interface PatentAnalysisInput {
	patent_number: string;
	analysis_type?: 'claims' | 'prior_art' | 'prosecution_history' | 'full';
}

export class PatentAnalysisTool implements vscode.LanguageModelTool<PatentAnalysisInput> {
	name = 'analyze_patent';
	description = 'Analyze a patent document for claims, prior art, and prosecution history';

	inputSchema = {
		type: 'object',
		properties: {
			patent_number: {
				type: 'string',
				description: 'Patent number (e.g., US1234567, EP1234567)'
			},
			analysis_type: {
				type: 'string',
				enum: ['claims', 'prior_art', 'prosecution_history', 'full'],
				description: 'Type of analysis to perform'
			}
		},
		required: ['patent_number']
	};

	async invoke(options: vscode.LanguageModelToolInvocationOptions<PatentAnalysisInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;
		const apiUrl = vscode.workspace.getConfiguration('flowleap').get('apiUrl') || 'http://localhost:8000';

		try {
			const response = await fetch(`${apiUrl}/api/patent/analyze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					patent_number: input.patent_number,
					analysis_type: input.analysis_type || 'full'
				})
			});

			if (!response.ok) {
				throw new Error(`Patent analysis failed: ${response.statusText}`);
			}

			const results = await response.json();
			const resultText = JSON.stringify(results, null, 2);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(resultText)
			]);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorText = JSON.stringify({
				error: `Patent analysis failed: ${errorMessage}`,
				patent_number: input.patent_number
			}, null, 2);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(errorText)
			]);
		}
	}
}
