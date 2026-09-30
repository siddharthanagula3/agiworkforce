const SLASH = 47;

const LOOPBACK_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '::1'];

export function isLoopbackHostname(value: string): boolean {
  return LOOPBACK_HOSTNAMES.includes(value.replace(/^\[/, '').replace(/\]$/, '').toLowerCase());
}

export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}
