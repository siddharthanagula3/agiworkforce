import { readFileSync } from 'fs';
import { dirname, join } from 'path';

function freshRuntime(): typeof import('../mermaidRuntime') {
  let loaded!: typeof import('../mermaidRuntime');
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import('../mermaidRuntime')>('../mermaidRuntime');
  });
  return loaded;
}

describe('bundled Mermaid runtime', () => {
  it('ships the real Mermaid build with the app, so diagrams need no network', () => {
    const packageRoot = dirname(require.resolve('mermaid/package.json'));
    const build = readFileSync(join(packageRoot, 'dist/mermaid.min.js'), 'utf8');
    expect(build.length).toBeGreaterThan(1_000_000);
    expect(build).toContain('mermaid');
    expect(build).not.toMatch(/<\/script/i);
  });

  it('loads the build once and serves every later diagram from memory', async () => {
    const { loadMermaidRuntime } = freshRuntime();
    const first = loadMermaidRuntime();
    expect(loadMermaidRuntime()).toBe(first);
    await expect(first).resolves.toBe('window.mermaid = {};');
  });

  it('keeps a closing script tag inside the runtime from ending the inline script', () => {
    const { inlineScriptSource } = freshRuntime();
    expect(inlineScriptSource('var s = "</script><b>";')).toBe('var s = "<\\/script><b>";');
  });
});
