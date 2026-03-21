import { describe, expect, it } from 'vitest';
import { buildReactPreviewDocument } from '../../components/UnifiedAgenticChat/artifact-components/ReactPreview';

describe('buildReactPreviewDocument', () => {
  it('removes wildcard postMessage targets and dynamic Function execution', () => {
    const document = buildReactPreviewDocument(
      'export default function App() { return <div>Hello</div>; }',
      'channel-1',
      'tauri://localhost',
    );

    expect(document).not.toContain('new Function');
    expect(document).not.toContain("postMessage({ channelId, type, ...payload }, '*')");
    expect(document).toContain('postMessage({ channelId, type, ...payload }, parentOrigin)');
    expect(document).toContain('import(moduleUrl)');
  });
});
