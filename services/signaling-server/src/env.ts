export function envText(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function envPositiveInteger(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number(envText(name, env));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
