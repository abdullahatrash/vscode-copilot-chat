#!/bin/bash

# FlowLeap Patent IDE Conversion Script
# This script automates the initial conversion steps

set -e

echo "🚀 FlowLeap Patent IDE Conversion Script"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the extension root."
    exit 1
fi

# Backup original package.json
echo "📦 Backing up package.json..."
cp package.json package.json.backup
echo "✅ Backup created: package.json.backup"
echo ""

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p src/extension/byok/node
mkdir -p src/extension/byok/vscode-node
mkdir -p src/extension/tools/node/patent
mkdir -p assets
echo "✅ Directories created"
echo ""

# Create FlowLeapEndpoint
echo "🔧 Creating FlowLeapEndpoint..."
cat > src/extension/byok/node/flowleapEndpoint.ts << 'EOF'
import { OpenAIEndpoint } from './openAIEndpoint';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigService } from '../../../platform/config/common/config';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';

export class FlowLeapEndpoint extends OpenAIEndpoint {
    constructor(
        modelMetadata: IChatModelInformation,
        authService: IAuthenticationService,
        configService: IConfigService,
        telemetryService: ITelemetryService,
        logService?: any,
        outputChannelService?: any,
        capiClientService?: any
    ) {
        const apiKey = configService.get('flowleap.apiKey') || process.env.FLOWLEAP_API_KEY || '';
        const baseUrl = configService.get('flowleap.apiUrl') || 'http://localhost:8000/v1/chat/completions';

        super(
            modelMetadata,
            apiKey,
            baseUrl,
            authService,
            configService,
            telemetryService,
            logService,
            outputChannelService,
            capiClientService
        );
    }

    override get requestHeaders(): Record<string, string> {
        const base = super.requestHeaders;
        return {
            ...base,
            'X-FlowLeap-Client': 'vscode-extension',
            'X-FlowLeap-Version': '0.1.0'
        };
    }
}
EOF
echo "✅ FlowLeapEndpoint created"
echo ""

# Create Patent Search Tool
echo "🔧 Creating Patent Search Tool..."
cat > src/extension/tools/node/patent/patentSearchTool.ts << 'EOF'
import * as vscode from 'vscode';

export class PatentSearchTool implements vscode.LanguageModelTool {
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

    async invoke(input: any, token: vscode.CancellationToken): Promise<any> {
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

            const results = await response.json();

            return {
                results: results.patents || [],
                count: results.count || 0,
                query: input.query,
                database: input.database || 'all'
            };
        } catch (error) {
            return {
                error: `Patent search failed: ${error.message}`,
                results: [],
                count: 0
            };
        }
    }
}
EOF
echo "✅ Patent Search Tool created"
echo ""

# Create Patent Analysis Tool
echo "🔧 Creating Patent Analysis Tool..."
cat > src/extension/tools/node/patent/patentAnalysisTool.ts << 'EOF'
import * as vscode from 'vscode';

export class PatentAnalysisTool implements vscode.LanguageModelTool {
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

    async invoke(input: any, token: vscode.CancellationToken): Promise<any> {
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

            return await response.json();
        } catch (error) {
            return {
                error: `Patent analysis failed: ${error.message}`,
                patent_number: input.patent_number
            };
        }
    }
}
EOF
echo "✅ Patent Analysis Tool created"
echo ""

# Create configuration snippet
echo "📝 Creating configuration example..."
cat > .vscode/settings.example.json << 'EOF'
{
  "flowleap.apiUrl": "http://localhost:8000/v1/chat/completions",
  "flowleap.apiKey": "",
  "flowleap.defaultModel": "flowleap-patent-gpt",
  "flowleap.enabled": true
}
EOF
echo "✅ Configuration example created: .vscode/settings.example.json"
echo ""

# Create README for conversion
echo "📚 Creating conversion README..."
cat > CONVERSION_STATUS.md << 'EOF'
# FlowLeap Conversion Status

## Completed Steps

- [x] Created FlowLeapEndpoint class
- [x] Created Patent Search Tool
- [x] Created Patent Analysis Tool
- [x] Created directory structure
- [x] Created configuration examples

## Next Steps

### Manual Steps Required

1. **Update package.json**
   - Change name, displayName, publisher, description
   - Update repository URLs
   - Add FlowLeap configuration properties
   - See FLOWLEAP_CONVERSION_GUIDE.md Phase 1

2. **Register FlowLeap Provider**
   - Create `src/extension/byok/vscode-node/flowleapProvider.ts`
   - Update extension activation in `src/extension.ts`
   - See FLOWLEAP_CONVERSION_GUIDE.md Phase 2.2-2.3

3. **Bypass GitHub Authentication**
   - Modify `src/extension/conversation/vscode-node/languageModelAccess.ts`
   - Update `src/platform/authentication/node/authenticationService.ts`
   - See FLOWLEAP_CONVERSION_GUIDE.md Phase 3

4. **Update Agent Prompts**
   - Modify `src/extension/prompts/node/agent/defaultAgentPrompt.ts`
   - See FLOWLEAP_CONVERSION_GUIDE.md Phase 4

5. **Register Patent Tools**
   - Update `src/extension/tools/node/toolRegistry.ts`
   - See FLOWLEAP_CONVERSION_GUIDE.md Phase 6.3

6. **Test Everything**
   - Follow Phase 7 in FLOWLEAP_CONVERSION_GUIDE.md

## Files Created

- `src/extension/byok/node/flowleapEndpoint.ts`
- `src/extension/tools/node/patent/patentSearchTool.ts`
- `src/extension/tools/node/patent/patentAnalysisTool.ts`
- `.vscode/settings.example.json`
- `CONVERSION_STATUS.md` (this file)

## Reference

See `FLOWLEAP_CONVERSION_GUIDE.md` for detailed instructions.
EOF
echo "✅ Conversion status created: CONVERSION_STATUS.md"
echo ""

echo "🎉 Initial conversion complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Read FLOWLEAP_CONVERSION_GUIDE.md for detailed instructions"
echo "   2. Read CONVERSION_STATUS.md for checklist"
echo "   3. Manually update package.json (see Phase 1)"
echo "   4. Create FlowLeapProvider (see Phase 2.2)"
echo "   5. Update extension activation (see Phase 2.3)"
echo ""
echo "🔧 Files created:"
echo "   - src/extension/byok/node/flowleapEndpoint.ts"
echo "   - src/extension/tools/node/patent/patentSearchTool.ts"
echo "   - src/extension/tools/node/patent/patentAnalysisTool.ts"
echo "   - .vscode/settings.example.json"
echo "   - CONVERSION_STATUS.md"
echo ""
echo "💾 Backup:"
echo "   - package.json.backup (restore with: mv package.json.backup package.json)"
echo ""
echo "Happy coding! 🚀"
