type ToolNameEncodingGlobals = typeof globalThis & {
  atob?: (value: string) => string;
  Buffer?: {
    from(value: string, encoding: string): {
      toString(encoding: string): string;
    };
  };
};

export function decodeBase64ToolSegment(segment: string): string {
  if (!segment.startsWith('b64_')) {
    return segment;
  }

  const encodedValue = segment.slice(4);
  if (!encodedValue) {
    return segment;
  }

  try {
    const globals = globalThis as ToolNameEncodingGlobals;
    if (typeof globals.atob === 'function') {
      return globals.atob(encodedValue);
    }

    if (globals.Buffer) {
      return globals.Buffer.from(encodedValue, 'base64').toString('utf-8');
    }
  } catch {
    return segment;
  }

  return segment;
}

export function decodeCompositeToolName(toolName: string): string {
  if (!toolName.includes('b64_')) {
    return toolName;
  }

  return toolName.replace(/b64_[A-Za-z0-9+/=]+/g, (segment) =>
    decodeBase64ToolSegment(segment),
  );
}
