export function validateUrl(url: string): { valid: boolean; sanitized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    if (/^169\.254\./.test(parsed.hostname)) {
      return { valid: false, error: 'Access to link-local addresses is not allowed' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
