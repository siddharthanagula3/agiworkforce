let signInOwed = false;

export function oweSignInForEndedSession(): void {
  signInOwed = true;
}

export function isSignInOwedForEndedSession(): boolean {
  return signInOwed;
}

export function settleSignInForEndedSession(): void {
  signInOwed = false;
}
