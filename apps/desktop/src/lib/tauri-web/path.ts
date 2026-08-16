export async function homeDir(): Promise<string> {
  return '~';
}

export async function appDataDir(): Promise<string> {
  return '/agiworkforce';
}

export async function join(...paths: string[]): Promise<string> {
  return paths
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}
