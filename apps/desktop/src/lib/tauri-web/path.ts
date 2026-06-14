export async function homeDir(): Promise<string> {
  return '~';
}

/**
 * Web has no real app-data directory. Return a stable virtual base so callers
 * can build `<base>/artifacts/<file>` paths; in web mode the eventual write
 * degrades to a browser download keyed on the file name, so the base is cosmetic.
 */
export async function appDataDir(): Promise<string> {
  return '/agiworkforce';
}

/** Join path segments with `/`, collapsing duplicate separators (web shim). */
export async function join(...paths: string[]): Promise<string> {
  return paths
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}
