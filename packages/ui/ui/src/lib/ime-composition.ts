// WebKit fires compositionend before the keydown that commits an IME candidate, so
// isComposing is already false there; keyCode 229 is the marker every engine still sets.
export const IME_PROCESSING_KEY_CODE = 229;

export interface ImeCompositionSignals {
  isComposing?: boolean;
  keyCode?: number;
}

export function isImeComposingKey(event: ImeCompositionSignals): boolean {
  return event.isComposing === true || event.keyCode === IME_PROCESSING_KEY_CODE;
}
