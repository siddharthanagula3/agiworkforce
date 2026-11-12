const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const FENCE = /^\s*```/;

function appendInline(parent: Node, text: string): void {
  for (const part of text.split(INLINE_PATTERN)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      parent.appendChild(code);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const emphasis = document.createElement('em');
      emphasis.textContent = part.slice(1, -1);
      parent.appendChild(emphasis);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * Builds the answer from DOM nodes and text only, so nothing the model writes
 * is ever parsed as HTML.
 */
export function renderAnswerInto(container: HTMLElement, text: string): void {
  container.replaceChildren();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: HTMLElement | null = null;
  let listKind: 'ul' | 'ol' | null = null;

  const closeParagraph = (): void => {
    if (paragraph.length === 0) return;
    const block = document.createElement('p');
    paragraph.forEach((line, index) => {
      if (index > 0) block.appendChild(document.createElement('br'));
      appendInline(block, line);
    });
    container.appendChild(block);
    paragraph = [];
  };
  const closeList = (): void => {
    list = null;
    listKind = null;
  };
  const nextItemKind = (from: number): 'ul' | 'ol' | null => {
    for (let next = from; next < lines.length; next += 1) {
      const candidate = lines[next] ?? '';
      if (!candidate.trim()) continue;
      if (BULLET.test(candidate)) return 'ul';
      return NUMBERED.test(candidate) ? 'ol' : null;
    }
    return null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE.test(line)) {
      closeParagraph();
      closeList();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = body.join('\n');
      pre.appendChild(code);
      container.appendChild(pre);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      if (listKind === null || nextItemKind(index + 1) !== listKind) closeList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const block = document.createElement('p');
      const strong = document.createElement('strong');
      appendInline(strong, heading[1] ?? '');
      block.appendChild(strong);
      container.appendChild(block);
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      closeParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || listKind !== kind) {
        list = document.createElement(kind);
        listKind = kind;
        if (numbered && Number(numbered[1]) > 1) {
          (list as HTMLOListElement).start = Number(numbered[1]);
        }
        container.appendChild(list);
      }
      const entry = document.createElement('li');
      appendInline(entry, (bullet ? bullet[1] : numbered?.[2]) ?? '');
      list.appendChild(entry);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  closeParagraph();
}
