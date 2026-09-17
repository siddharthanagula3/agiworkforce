export function browserSupportsPasskeys(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}
