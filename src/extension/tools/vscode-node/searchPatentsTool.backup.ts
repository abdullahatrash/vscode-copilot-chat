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

interface PatentSearchResult {
	success: boolean;
	total?: number;
	range?: {
		begin: number;
		end: number;
	};
	docs?: Array<{
		docId: string;
		title: string | null;
		abstract: string | null;
		applicants: string[];
		publicationDate: string | null;
	}>;
	query?: string;
	error?: string;
}

/**
 * Tool for searching patent databases using CQL (Common Patent Query Language)
 * via the EPO OPS (Open Patent Services) API
 */
class SearchPatentsTool implements ICopilotTool<ISearchPatentsParams> {

	public static readonly toolName = ToolName.SearchPatents;

	// Token cache
	private tokenData: {
		access_token: string;
		expires_in: number;
		expiry_time: number;
	} | null = null;

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
			// Get EPO credentials from environment variables
			// TODO: Move to SecretStorage for production
			const clientId = process.env.EPO_CLIENT_ID;
			const clientSecret = process.env.EPO_CLIENT_SECRET;

			console.log('[SearchPatentsTool] Starting patent search with query:', query, 'range:', range);
			console.log('[SearchPatentsTool] EPO credentials available:', !!clientId, !!clientSecret);
			this.logService.info(`[SearchPatentsTool] Starting patent search with query: ${query}, range: ${range}`);
			this.logService.info(`[SearchPatentsTool] EPO credentials available: ${!!clientId} ${!!clientSecret}`);

			if (!clientId || !clientSecret) {
				this.logService.error('[SearchPatentsTool] Missing EPO credentials in environment variables');
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Error: EPO API credentials are not configured. Please set EPO_CLIENT_ID and EPO_CLIENT_SECRET environment variables.')
				]);
			}

			// Execute patent search
			const result = await this.searchPatents(query, range, clientId, clientSecret);

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
			const response = this.formatSearchResults(result);
			console.log(`[SearchPatentsTool] Formatted response length: ${response.length} chars`);
			console.log(`[SearchPatentsTool] Response preview:`, response.substring(0, 300));
			this.logService.info(`[SearchPatentsTool] Formatted response length: ${response.length} chars`);
			this.logService.info(`[SearchPatentsTool] Response preview: ${response.substring(0, 200)}...`);

			return new LanguageModelToolResult([
				new LanguageModelTextPart(response)
			]);

		} catch (error) {
			this.logService.error('[SearchPatentsTool] Exception:', error);
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
			]);
		}
	}

	/**
	 * Get OAuth2 access token from EPO OPS API
	 */
	private async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
		const now = Date.now();

		// Return cached token if valid (30 seconds before expiry)
		if (this.tokenData && this.tokenData.expiry_time > now + 30_000) {
			return this.tokenData.access_token;
		}

		const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

		const response = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': `Basic ${authString}`,
			},
			body: 'grant_type=client_credentials',
		});

		if (!response.ok) {
			throw new Error(`EPO Auth failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as { access_token: string; expires_in: number };

		this.tokenData = {
			access_token: data.access_token,
			expires_in: data.expires_in,
			expiry_time: now + data.expires_in * 1000,
		};

		return this.tokenData.access_token;
	}

	/**
	 * Search patents using CQL query
	 */
	private async searchPatents(query: string, range: string, clientId: string, clientSecret: string): Promise<PatentSearchResult> {
		try {
			// Get access token
			const token = await this.getAccessToken(clientId, clientSecret);

			// Make search request to EPO OPS API
			const url = `https://ops.epo.org/3.2/rest-services/published-data/search?q=${encodeURIComponent(query)}`;
			console.log('[SearchPatentsTool] Fetching from URL:', url);
			this.logService.info(`[SearchPatentsTool] Fetching from URL: ${url}`);

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${token}`,
					'X-OPS-Range': range,
				},
			});

			console.log('[SearchPatentsTool] Response status:', response.status);
			this.logService.info(`[SearchPatentsTool] Response status: ${response.status}`);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[SearchPatentsTool] EPO API error response:', errorText.substring(0, 500));
				this.logService.error('[SearchPatentsTool] EPO API error response:', errorText.substring(0, 500));
				return {
					success: false,
					error: `EPO API error ${response.status}: ${errorText.substring(0, 200)}`,
					query
				};
			}

			// Parse JSON response
			const data = await response.json() as Record<string, unknown>;
			console.log('[SearchPatentsTool] Raw API response:', JSON.stringify(data).substring(0, 1000));
			this.logService.info(`[SearchPatentsTool] Raw API response: ${JSON.stringify(data).substring(0, 1000)}`);

			// Extract results
			const [begin, end] = range.split('-').map(n => parseInt(n, 10));

			// Get total count
			const worldPatentDataRoot = data?.['ops:world-patent-data'] as Record<string, unknown> | undefined;
			const biblioSearch = worldPatentDataRoot?.['ops:biblio-search'] as Record<string, unknown> | undefined;
			const searchResult = biblioSearch?.['ops:search-result'] as Record<string, unknown> | undefined;
			const totalCount = biblioSearch?.['@total-result-count'];
			const total = parseInt(typeof totalCount === 'string' ? totalCount : '0', 10);

			console.log('[SearchPatentsTool] Total count from API:', total);

			// Extract documents
			const docs: Array<{
				docId: string;
				title: string | null;
				abstract: string | null;
				applicants: string[];
				publicationDate: string | null;
			}> = [];
			const pubRefs = searchResult?.['ops:publication-reference'] as unknown[] | unknown | undefined;

			if (pubRefs) {
				const refsArray = Array.isArray(pubRefs) ? pubRefs : [pubRefs];
				console.log('[SearchPatentsTool] Processing', refsArray.length, 'patent references');

				// Get exchange documents if available (contains bibliographic data)
				const exchangeDocsContainer = searchResult?.['exchange-documents'] as Record<string, unknown> | undefined;
				const exchangeDocs = exchangeDocsContainer?.['exchange-document'] as unknown[] | unknown | undefined;
				const exchangeDocsArray = exchangeDocs ? (Array.isArray(exchangeDocs) ? exchangeDocs : [exchangeDocs]) : [];

				console.log('[SearchPatentsTool] Exchange documents found:', exchangeDocsArray.length);

				for (let i = 0; i < refsArray.length; i++) {
					const doc = refsArray[i];
					const docIdData = doc?.['document-id'];
					const docIdArr = Array.isArray(docIdData) ? docIdData[0] : docIdData;

					// EPO returns values in objects with $ property
					const country = docIdArr?.country?.$ || '';
					const number = docIdArr?.['doc-number']?.$ || '';
					const kind = docIdArr?.kind?.$ || '';

					const docId = kind ? `${country}${number}.${kind}` : `${country}${number}`;

					console.log('[SearchPatentsTool] Parsed patent:', docId);

					// Try to extract bibliographic data from exchange document
					let title = null;
					let abstract = null;
					let applicants: string[] = [];

					if (exchangeDocsArray[i]) {
						const exchangeDoc = exchangeDocsArray[i];
						const biblioData = exchangeDoc?.['bibliographic-data'];

						// Extract title (invention-title)
						const titleData = biblioData?.['invention-title'];
						if (titleData) {
							const titleArr = Array.isArray(titleData) ? titleData : [titleData];
							// Try to get English title first, fallback to any language
							const englishTitle = titleArr.find((t: any) => t?.['@language'] === 'en');
							const anyTitle = titleArr[0];
							title = (englishTitle?.$ || anyTitle?.$ || null);
						}

						// Extract abstract
						const abstractData = biblioData?.abstract;
						if (abstractData) {
							const abstractArr = Array.isArray(abstractData) ? abstractData : [abstractData];
							// Try to get English abstract first
							const englishAbstract = abstractArr.find((a: any) => a?.['@language'] === 'en');
							const anyAbstract = abstractArr[0];
							const abstractText = englishAbstract?.p || anyAbstract?.p;

							if (abstractText) {
								// Abstract can be string or object with $
								abstract = typeof abstractText === 'string' ? abstractText : (abstractText?.$ || null);
							}
						}

						// Extract applicants
						const partiesData = biblioData?.parties;
						if (partiesData?.applicants?.applicant) {
							const applicantsData = partiesData.applicants.applicant;
							const applicantsArr = Array.isArray(applicantsData) ? applicantsData : [applicantsData];

							applicants = applicantsArr
								.map((app: any) => {
									const nameData = app?.['applicant-name'];
									if (nameData) {
										const nameArr = Array.isArray(nameData) ? nameData : [nameData];
										return nameArr[0]?.name?.$ || nameArr[0]?.$ || null;
									}
									return null;
								})
								.filter((name: string | null) => name !== null) as string[];
						}
					}

					console.log('[SearchPatentsTool] Extracted data:', { docId, title, abstract: abstract?.substring(0, 50), applicants });

					docs.push({
						docId,
						title,
						abstract,
						applicants,
						publicationDate: docIdArr?.date?.$ || null,
					});
				}

				// If no exchange documents in search response, fetch bibliographic data separately
				if (exchangeDocsArray.length === 0 && docs.length > 0) {
					console.log('[SearchPatentsTool] No exchange documents in search response, fetching bibliographic data separately...');
					this.logService.info(`[SearchPatentsTool] Fetching bibliographic data for ${docs.length} patents`);

					// Fetch in parallel with a small delay between requests to respect rate limits
					for (let i = 0; i < docs.length; i++) {
						try {
							const biblioData = await this.fetchBibliographicData(docs[i].docId, token);
							docs[i].title = biblioData.title;
							docs[i].abstract = biblioData.abstract;
							docs[i].applicants = biblioData.applicants;

							console.log(`[SearchPatentsTool] Fetched biblio for ${docs[i].docId}:`, {
								title: biblioData.title?.substring(0, 50),
								applicants: biblioData.applicants.length
							});

							// Small delay to respect rate limits (400ms = ~2.5 req/sec)
							if (i < docs.length - 1) {
								await new Promise(resolve => setTimeout(resolve, 400));
							}
						} catch (error) {
							console.warn(`[SearchPatentsTool] Failed to fetch biblio for ${docs[i].docId}:`, error);
							// Continue with other documents
						}
					}
				}
			}

			return {
				success: true,
				total,
				range: { begin, end },
				docs,
				query
			};

		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				query
			};
		}
	}

	/**
	 * Fetch bibliographic data for a specific patent document
	 */
	private async fetchBibliographicData(
		docId: string,
		token: string
	): Promise<{ title: string | null; abstract: string | null; applicants: string[] }> {
		try {
			// Parse document ID (e.g., "EP1234567.A1" -> country: EP, number: 1234567, kind: A1)
			const match = docId.match(/^([A-Z]{2})(\d+)(?:\.)?([A-Z]\d)?$/);
			if (!match) {
				console.warn(`[SearchPatentsTool] Invalid docId format: ${docId}`);
				return { title: null, abstract: null, applicants: [] };
			}

			const [, country, number, kind] = match;
			const kindCode = kind || '';

			// Construct biblio endpoint URL
			const url = `https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/${country}.${number}.${kindCode}/biblio`;

			console.log(`[SearchPatentsTool] Fetching biblio from: ${url}`);

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				console.warn(`[SearchPatentsTool] Failed to fetch biblio for ${docId}: ${response.status}`);
				return { title: null, abstract: null, applicants: [] };
			}

			const data = await response.json() as Record<string, unknown>;

			// Navigate to bibliographic-data
			const worldPatentData = data?.['ops:world-patent-data'] as Record<string, unknown> | undefined;
			const exchangeDocs = worldPatentData?.['exchange-documents'] as Record<string, unknown> | undefined;
			const exchangeDoc = exchangeDocs?.['exchange-document'] as Record<string, unknown> | undefined;
			const biblioData = exchangeDoc?.['bibliographic-data'] as Record<string, unknown> | undefined;

			if (!biblioData) {
				console.warn(`[SearchPatentsTool] No bibliographic data found for ${docId}`);
				return { title: null, abstract: null, applicants: [] };
			}

			// Extract title (same logic as before)
			let title = null;
			const titleData = biblioData?.['invention-title'];
			if (titleData) {
				const titleArr = Array.isArray(titleData) ? titleData : [titleData];
				const englishTitle = titleArr.find((t: any) => t?.['@language'] === 'en');
				const anyTitle = titleArr[0];
				title = (englishTitle?.$ || anyTitle?.$ || null);
			}

			// Extract abstract (same logic as before)
			let abstract = null;
			const abstractData = biblioData?.abstract;
			if (abstractData) {
				const abstractArr = Array.isArray(abstractData) ? abstractData : [abstractData];
				const englishAbstract = abstractArr.find((a: any) => a?.['@language'] === 'en');
				const anyAbstract = abstractArr[0];
				const abstractText = englishAbstract?.p || anyAbstract?.p;

				if (abstractText) {
					abstract = typeof abstractText === 'string' ? abstractText : (abstractText?.$ || null);
				}
			}

			// Extract applicants (same logic as before)
			let applicants: string[] = [];
			const partiesData = biblioData?.['parties'] as Record<string, unknown> | undefined;
			const applicantsContainer = partiesData?.['applicants'] as Record<string, unknown> | undefined;
			if (applicantsContainer?.['applicant']) {
				const applicantsData = applicantsContainer['applicant'];
				const applicantsArr = Array.isArray(applicantsData) ? applicantsData : [applicantsData];

				applicants = applicantsArr
					.map((app: any) => {
						const nameData = app?.['applicant-name'];
						if (nameData) {
							const nameArr = Array.isArray(nameData) ? nameData : [nameData];
							return nameArr[0]?.name?.$ || nameArr[0]?.$ || null;
						}
						return null;
					})
					.filter((name: string | null) => name !== null) as string[];
			}

			return { title, abstract, applicants };

		} catch (error) {
			console.error(`[SearchPatentsTool] Error fetching biblio for ${docId}:`, error);
			return { title: null, abstract: null, applicants: [] };
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
