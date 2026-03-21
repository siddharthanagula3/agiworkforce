function getDefaultPath(input?: string | { defaultPath?: string | null } | null): string | null {
  if (typeof input === 'string') {
    return input;
  }

  return input?.defaultPath ?? null;
}

export async function open(): Promise<null> {
  return null;
}

export async function save(input?: string | { defaultPath?: string | null }): Promise<string> {
  return getDefaultPath(input) ?? 'download.txt';
}

export async function message(): Promise<void> {}

export async function ask(): Promise<boolean> {
  return false;
}

export async function confirm(): Promise<boolean> {
  return false;
}
