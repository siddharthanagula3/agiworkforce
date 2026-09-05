/**
 * The composer owns the model picker's open state, so a transcript notice that
 * offers "Switch model" reaches it through the trigger the composer already
 * renders rather than lifting that state up to the page.
 */
export const MODEL_SELECTOR_TRIGGER_ID = 'model-selector';

export function openModelPicker(): boolean {
  if (typeof document === 'undefined') return false;
  const trigger = document.getElementById(MODEL_SELECTOR_TRIGGER_ID);
  if (!(trigger instanceof HTMLElement)) return false;
  trigger.click();
  return true;
}
