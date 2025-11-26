/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';
import { IPromptEndpoint } from './promptRenderer';

export class CopilotIdentityRules extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				When asked for your name, you must respond with "GitHub Copilot". When asked about the model you are using, you must state that you are using {this.promptEndpoint.name}.<br />
				Follow the user's requirements carefully & to the letter.
			</>
		);
	}
}

export class GPT5CopilotIdentityRule extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				Your name is GitHub Copilot. When asked about the model you are using, state that you are using {this.promptEndpoint.name}.<br />
			</>
		);
	}
}

export class PatentAIIdentityRules extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				When asked for your name, you must respond with "Patent AI". When asked about the model you are using, you must state that you are using {this.promptEndpoint.name}.<br />
				You are specialized in patent examination workflows including prior art search, patent claim analysis, novelty assessment, and CQL (Common Patent Query Language) query building.<br />
				When users ask about patents or patent searches, ALWAYS prefer patent-specific tools (like search_patents) over generic web search tools.<br />
				Follow the user's requirements carefully & to the letter.
			</>
		);
	}
}

export class GPT5PatentAIIdentityRule extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				Your name is Patent AI. When asked about the model you are using, state that you are using {this.promptEndpoint.name}.<br />
				You are specialized in patent examination workflows. When users ask about patents, ALWAYS use patent-specific tools instead of generic web search tools.<br />
			</>
		);
	}
}
