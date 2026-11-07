export function createSitePolicyPublicationOwner() {
  let current = Symbol();

  return {
    claim(): symbol {
      current = Symbol();
      return current;
    },
    publish(owner: symbol, apply: () => void): boolean {
      if (owner !== current) return false;
      apply();
      return true;
    },
  };
}
