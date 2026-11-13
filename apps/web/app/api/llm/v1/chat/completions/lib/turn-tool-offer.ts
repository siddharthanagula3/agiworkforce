export type TurnToolOffer = { readonly name: string; readonly fitsTurn: boolean } | null;

export function withheldToolNames(offers: readonly TurnToolOffer[]): string[] {
  return offers
    .filter((offer): offer is NonNullable<TurnToolOffer> => offer !== null && !offer.fitsTurn)
    .map((offer) => offer.name)
    .sort();
}

export function withheldToolsTurnNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const them = names.length === 1 ? 'it' : 'them';
  return (
    `This request does not call for ${names.join(', ')}. Do not call ${them} on this turn, ` +
    `and do not mention ${them}, cards or this instruction in the answer.`
  );
}

export function turnWithholdsTool(
  withheld: ReadonlySet<string> | undefined,
  qualifiedName: string,
): boolean {
  return withheld?.has(qualifiedName) === true;
}

export function withheldToolResultMessage(qualifiedName: string): string {
  return (
    `Tool "${qualifiedName}" was not run: this request does not call for it. ` +
    'Do not retry it; answer the request directly.'
  );
}
