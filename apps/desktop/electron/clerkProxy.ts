export function frontendApiFromPublishableKey(publishableKey: string): string {
  const key = publishableKey.trim();
  const encoded = key.startsWith('pk_live_')
    ? key.slice('pk_live_'.length)
    : key.startsWith('pk_test_')
      ? key.slice('pk_test_'.length)
      : null;
  if (encoded === null) {
    throw new Error('The Clerk publishable key must start with pk_live_ or pk_test_.');
  }
  if (encoded === '') {
    throw new Error('The Clerk publishable key is empty after its prefix.');
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    throw new Error('The Clerk publishable key is not valid base64.');
  }
  if (!decoded.endsWith('$')) {
    throw new Error('The Clerk publishable key has an unexpected payload.');
  }
  const host = decoded.slice(0, -1);
  if (host === '' || host.includes('$') || !host.includes('.')) {
    throw new Error('The Clerk publishable key does not name a frontend API host.');
  }
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('The Clerk publishable key names an invalid frontend API host.');
  }
  return host;
}
