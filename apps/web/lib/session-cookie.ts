export interface SessionCookie {
  name: string;
  value: string;
}

export function hasBrowserSessionCookie(cookies: readonly SessionCookie[]): boolean {
  const clientUat = cookies.find(({ name }) => name === '__client_uat')?.value;
  if (clientUat !== undefined) return clientUat !== '' && clientUat !== '0';
  return cookies.some(({ name }) => name === '__session');
}

export function parseCookieHeader(cookieHeader: string): SessionCookie[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((pair) => {
      const [rawName, ...rawValueParts] = pair.split('=');
      return { name: rawName?.trim() ?? '', value: rawValueParts.join('=').trim() };
    })
    .filter(({ name }) => Boolean(name));
}
