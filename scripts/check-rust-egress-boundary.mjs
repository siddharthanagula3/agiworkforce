#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { checkEgressBoundary } from './lib/rust-egress-boundary.mjs';

const root = process.cwd();
const sourceRoot = path.join(root, 'apps/desktop/src-tauri/src');

const ALLOWLIST = [
  'apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs',
  'apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs',
  'apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs',
  'apps/desktop/src-tauri/src/core/embeddings/generator.rs',
  'apps/desktop/src-tauri/src/core/llm/providers/bedrock.rs',
  'apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs',
  'apps/desktop/src-tauri/src/core/llm/providers/http_client_factory.rs',
  'apps/desktop/src-tauri/src/features/productivity/asana_client.rs',
  'apps/desktop/src-tauri/src/features/productivity/notion_client.rs',
  'apps/desktop/src-tauri/src/features/productivity/trello_client.rs',
  'apps/desktop/src-tauri/src/features/speech/local_stt.rs',
  'apps/desktop/src-tauri/src/features/speech/local_tts.rs',
  'apps/desktop/src-tauri/src/features/speech/tts.rs',
  'apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs',
  'apps/desktop/src-tauri/src/integrations/cloud/dropbox.rs',
  'apps/desktop/src-tauri/src/integrations/cloud/google_drive.rs',
  'apps/desktop/src-tauri/src/integrations/cloud/one_drive.rs',
  'apps/desktop/src-tauri/src/sys/api/client.rs',
  'apps/desktop/src-tauri/src/sys/api/oauth.rs',
  'apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs',
  'apps/desktop/src-tauri/src/sys/commands/mcpb.rs',
  'apps/desktop/src-tauri/src/sys/commands/media.rs',
  'apps/desktop/src-tauri/src/sys/commands/ollama.rs',
  'apps/desktop/src-tauri/src/sys/commands/voice.rs',
  'apps/desktop/src-tauri/src/sys/security/egress_policy.rs',
  'apps/desktop/src-tauri/src/sys/telemetry/collector.rs',
];

function isRustTestPath(fullPath) {
  const relative = path.relative(root, fullPath).split(path.sep).join('/');
  return /\/tests\//.test(relative) || /_tests?\.rs$/.test(relative);
}

function collectRustFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'target') continue;
      collectRustFiles(fullPath, files);
      continue;
    }
    if (entry.name.endsWith('.rs') && !isRustTestPath(fullPath)) {
      files.push({
        path: path.relative(root, fullPath).split(path.sep).join('/'),
        source: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }
  return files;
}

const errors = checkEgressBoundary({
  files: collectRustFiles(sourceRoot),
  allowlist: ALLOWLIST,
});

if (errors.length > 0) {
  console.error('Rust egress boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Rust egress boundary check passed (${ALLOWLIST.length} transports still awaiting migration).`,
);
