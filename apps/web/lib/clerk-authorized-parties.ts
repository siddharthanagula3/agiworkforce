export function getClerkAuthorizedParties(): string[] {
  return (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
