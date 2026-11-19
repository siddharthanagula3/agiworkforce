export function placesScope(body: { query: string; near?: string }): string {
  return body.near ? `${body.query} near ${body.near}` : body.query;
}
