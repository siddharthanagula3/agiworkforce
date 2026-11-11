let runtime: Promise<string> | null = null;

export function inlineScriptSource(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

export function loadMermaidRuntime(): Promise<string> {
  if (!runtime) {
    runtime = import('mermaid/dist/mermaid.min.js')
      .then((build) => inlineScriptSource(build.default))
      .catch((error: unknown) => {
        runtime = null;
        throw error;
      });
  }
  return runtime;
}
