import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Web Cloud project state boundary', () => {
  it('does not merge server projects with unowned browser-only project rows', () => {
    for (const path of [
      'features/chat/pages/WebChatPage.tsx',
      'shared/components/layout/WebAppShell.tsx',
      'app/projects/[id]/page.tsx',
    ]) {
      expect(source(path), path).not.toContain('localOnly');
    }
  });

  it('uses the managed cloud project session on every Web project surface', () => {
    for (const path of [
      'features/chat/pages/WebChatPage.tsx',
      'shared/components/layout/WebAppShell.tsx',
      'app/projects/page.tsx',
      'app/projects/[id]/page.tsx',
    ]) {
      expect(source(path), path).toContain('useManagedCloudProjects');
    }
  });

  it('never presents Web Cloud projects as local or device-only', () => {
    const listPage = source('app/projects/page.tsx');
    const detailPage = source('app/projects/[id]/page.tsx');
    const adapter = source('features/projects/services/managed-cloud-projects.ts');

    expect(listPage).not.toMatch(/stored on this device/i);
    expect(detailPage).not.toMatch(/does not exist on this device/i);
    expect(detailPage).not.toContain("ownerUserId: 'local-user'");
    expect(detailPage).not.toContain("defaultPrivacyMode: 'local'");
    expect(detailPage).not.toContain("defaultProviderMode: 'Local'");
    expect(detailPage).toContain("project.defaultPrivacyMode ?? 'managed'");
    expect(detailPage).toContain("project.defaultProviderMode ?? 'ManagedGateway'");
    expect(adapter).toContain('ownerUserId: project.ownerUserId');
    expect(adapter).toContain('defaultProviderMode: project.defaultProviderMode');
  });

  it('persists archive actions and does not discard rows when a delete request fails', () => {
    const listPage = source('app/projects/page.tsx');
    const shell = source('shared/components/layout/WebAppShell.tsx');

    expect(listPage).toContain('webManagedCloudProjects.updateProject');
    expect(listPage).not.toMatch(/finally\s*{\s*removeProject\(/);
    expect(shell).not.toMatch(/finally\s*{\s*removeProjectFromStore\(/);
  });
});
