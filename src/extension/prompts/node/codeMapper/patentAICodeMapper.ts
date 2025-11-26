/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MappedEditsResponseStream, CancellationToken } from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { ICodeMapperRequestInput, CodeMapperOutcome, isNewDocument, processFullRewrite } from './codeMapper';
import { ILogService } from '../../../../platform/log/common/logService';

/**
 * Patent AI Code Mapper - Calls Patent AI backend instead of GitHub Copilot
 */
export class PatentAICodeMapper {

	private readonly PATENT_API_BASE_URL: string;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		// Get base URL, removing /v1/chat/completions if present
		const url = process.env.PATENT_API_URL || 'http://localhost:8000';
		this.PATENT_API_BASE_URL = url.replace(/\/v1\/chat\/completions$/, '');
	}

	async mapCode(
		request: ICodeMapperRequestInput,
		responseStream: MappedEditsResponseStream,
		token: CancellationToken
	): Promise<CodeMapperOutcome | undefined> {

		if (token.isCancellationRequested) {
			return undefined;
		}

		const { codeBlock, uri, markdownBeforeBlock } = request;

		this.logService.info('[Patent AI Code Mapper] ========== REQUEST ==========');
		this.logService.info(`[Patent AI Code Mapper] File: ${uri.fsPath}`);
		this.logService.info(`[Patent AI Code Mapper] Instruction: ${markdownBeforeBlock || 'none'}`);

		try {
			// Get existing code
			let existingCode = '';
			if (!isNewDocument(request) && request.existingDocument) {
				existingCode = request.existingDocument.getText();
			}

			// Call Patent AI backend
			const response = await fetch(`${this.PATENT_API_BASE_URL}/v1/code-mapper`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					existingCode,
					newCode: codeBlock,
					filePath: uri.fsPath,
					instruction: markdownBeforeBlock || '',
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				this.logService.error(`[Patent AI Code Mapper] Backend error: ${response.status} ${errorText}`);

				return {
					errorDetails: {
						message: `Code mapping failed: ${errorText}`,
					},
					annotations: [],
				};
			}

			const result = await response.json() as { success: boolean; error?: string; newCode?: string };

			if (!result.success) {
				this.logService.error(`[Patent AI Code Mapper] Backend returned error: ${result.error}`);

				return {
					errorDetails: {
						message: `Code mapping failed: ${result.error}`,
					},
					annotations: [],
				};
			}

			// Apply the full rewrite using the existing utility
			if (result.newCode) {
				const existingDocument = isNewDocument(request) ? undefined : request.existingDocument;
				const textDoc = existingDocument instanceof TextDocumentSnapshot ? existingDocument : undefined;
				await processFullRewrite(uri, textDoc, result.newCode, responseStream, token, []);
			}

			this.logService.info('[Patent AI Code Mapper] ✅ Code mapping complete');

			return {
				annotations: [],
			};

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during code mapping';
			this.logService.error(`[Patent AI Code Mapper] Exception: ${errorMessage}`);

			return {
				errorDetails: {
					message: errorMessage,
				},
				annotations: [],
			};
		}
	}
}
