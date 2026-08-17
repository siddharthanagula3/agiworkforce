function inlineCodeSpanEnd(content: string, open: number): number {
  for (let i = open + 1; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '`') return i;
    if (ch === '\n') return -1;
  }
  return -1;
}

export function normalizeMathDelimiters(content: string): string {
  let out = '';
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === '`') {
      if (content.startsWith('```', i)) {
        const end = content.indexOf('```', i + 3);
        if (end !== -1) {
          out += content.slice(i, end + 3);
          i = end + 3;
          continue;
        }
      }
      const spanEnd = inlineCodeSpanEnd(content, i);
      if (spanEnd !== -1) {
        out += content.slice(i, spanEnd + 1);
        i = spanEnd + 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      if (content.startsWith('\\[', i)) {
        const end = content.indexOf('\\]', i + 3);
        if (end !== -1) {
          out += `\n\n$$\n${content.slice(i + 2, end)}\n$$\n\n`;
          i = end + 2;
          continue;
        }
      }
      if (content.startsWith('\\(', i)) {
        const end = content.indexOf('\\)', i + 3);
        if (end !== -1) {
          out += `$${content.slice(i + 2, end)}$`;
          i = end + 2;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function closeUnterminatedCodeFence(content: string): string {
  let i = 0;
  while (i < content.length) {
    if (content.startsWith('```', i)) {
      const end = content.indexOf('```', i + 3);
      if (end === -1) {
        return content.endsWith('\n') ? `${content}\`\`\`` : `${content}\n\`\`\``;
      }
      i = end + 3;
      continue;
    }
    i += 1;
  }
  return content;
}

export function normalizeMarkdownSource(content: string): string {
  return normalizeMathDelimiters(closeUnterminatedCodeFence(content));
}
