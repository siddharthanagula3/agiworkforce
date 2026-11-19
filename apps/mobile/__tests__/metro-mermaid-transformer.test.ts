/**
 * @jest-environment node
 */
import { realpathSync } from 'fs';
import { dirname, relative, resolve } from 'path';

interface TransformProps {
  filename: string;
  src: string;
  options: { projectRoot: string };
}

interface Upstream {
  transform: (props: TransformProps) => unknown;
  getCacheKey?: () => string;
}

interface TransformerModule {
  createMermaidSourceTransformer: (input: { upstream: Upstream; mermaidBuild: string }) => {
    isMermaidBuild: (filename: string, projectRoot: string) => boolean;
    transform: (props: TransformProps) => unknown;
    getCacheKey: () => string;
  };
  mermaidSourceModule: (source: string) => string;
}

const { createMermaidSourceTransformer, mermaidSourceModule } =
  jest.requireActual<TransformerModule>('../native/metro-mermaid-transformer.cjs');
const projectRoot = resolve(__dirname, '..');
const mermaidBuild = realpathSync(
  resolve(dirname(require.resolve('mermaid/package.json')), 'dist/mermaid.min.js'),
);

function makeTransformer() {
  const upstream = {
    transform: jest.fn((props: TransformProps) => props.src),
    getCacheKey: () => 'expo-babel',
  };
  return { upstream, transformer: createMermaidSourceTransformer({ upstream, mermaidBuild }) };
}

describe('Metro transformer for the bundled Mermaid build', () => {
  it('turns Mermaid’s browser build into a string module and leaves app code alone', () => {
    const { upstream, transformer } = makeTransformer();
    const options = { projectRoot };

    transformer.transform({
      filename: relative(projectRoot, mermaidBuild),
      src: 'var a = 1;',
      options,
    });
    transformer.transform({ filename: 'src/app.ts', src: 'export const b = 2;', options });

    expect(upstream.transform.mock.calls[0]?.[0].src).toBe('module.exports = "var a = 1;";');
    expect(upstream.transform.mock.calls[1]?.[0].src).toBe('export const b = 2;');
  });

  it('recognises the build only by its real path', () => {
    const { transformer } = makeTransformer();
    expect(transformer.isMermaidBuild(relative(projectRoot, mermaidBuild), projectRoot)).toBe(true);
    expect(
      transformer.isMermaidBuild('src/features/chat/components/mermaidRuntime.ts', projectRoot),
    ).toBe(false);
    expect(transformer.isMermaidBuild('does/not/exist.js', projectRoot)).toBe(false);
  });

  it('keeps the source byte for byte when the app reads the string back', () => {
    const source = 'var s = "quote \\" and </p>";\n';
    const moduleSource = mermaidSourceModule(source);
    const prefix = 'module.exports = ';
    expect(moduleSource.startsWith(prefix)).toBe(true);
    expect(moduleSource.endsWith(';')).toBe(true);
    expect(JSON.parse(moduleSource.slice(prefix.length, -1))).toBe(source);
  });

  it('extends the upstream cache key so a copy built as app code is never reused', () => {
    const { transformer } = makeTransformer();
    expect(transformer.getCacheKey()).toBe('expo-babel:mermaid-source-module-1');
  });
});
