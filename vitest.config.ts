import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'vitest/config';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const isRootInvocation = process.cwd() === configDirectory;

export default defineConfig({
  test: isRootInvocation
    ? {
        projects: [
          'apps/extension',
          'apps/extension-vscode',
          'apps/web',
          'services/signaling-server',
          'packages/ai/provider-runtime',
          'packages/ai/routing',
          'packages/ai/search',
          'packages/client/client-runtime',
          'packages/client/sync',
          'packages/contracts/cloud-contracts',
          'packages/contracts/compliance',
          'packages/contracts/licensing',
          'packages/contracts/trust-boundaries',
          'packages/contracts/types',
          'packages/guardian/core',
          'packages/guardian/github',
          'packages/platform/artifacts',
          'packages/platform/data-layer',
          'packages/platform/utils',
          'packages/ui/icons',
          'packages/ui/ui',
          'packages/ui/unified-chat',
        ],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'json', 'html'],
        },
      }
    : {},
});
