function insertAtSelection(input: HTMLTextAreaElement, text: string, fallback: string): void {
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }
  if (inserted) return;
  input.value = fallback;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function replaceComposerText(input: HTMLTextAreaElement, text: string): void {
  input.focus();
  input.select();
  insertAtSelection(input, text, text);
}

export function appendComposerText(input: HTMLTextAreaElement, text: string): void {
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
  const addition = input.value && !/\s$/.test(input.value) ? ` ${text}` : text;
  insertAtSelection(input, addition, `${input.value}${addition}`);
}

export function replaceComposerRange(
  input: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
): void {
  input.focus();
  input.setSelectionRange(start, end);
  insertAtSelection(input, text, `${input.value.slice(0, start)}${text}${input.value.slice(end)}`);
}
