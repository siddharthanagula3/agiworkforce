export function trackComposerPointerFocus(input: HTMLTextAreaElement): void {
  input.addEventListener('pointerdown', () => input.setAttribute('data-pointer-focus', ''));
  input.addEventListener('blur', () => input.removeAttribute('data-pointer-focus'));
}
