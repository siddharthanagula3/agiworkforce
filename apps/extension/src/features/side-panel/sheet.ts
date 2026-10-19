export function wireSheetKeyboard(sheet: HTMLElement, onEscape: () => void): void {
  sheet.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      sheet.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
    ).filter((node) => node.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
