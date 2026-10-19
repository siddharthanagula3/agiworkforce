export function isImageSelection(html: string): boolean {
  return /^\s*<img\b/i.test(html);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function serialize(source: string, document: Document): string {
  const isFullDocument = /<html[\s>]/i.test(source);
  if (!isFullDocument) return document.body.innerHTML;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(source)?.[0]?.trim();
  return `${doctype ? `${doctype}\n` : ''}${document.documentElement.outerHTML}`;
}

export function replaceImageInHtml(
  source: string,
  selector: string,
  dataUrl: string,
): string | null {
  let document: Document;
  try {
    document = new DOMParser().parseFromString(source, 'text/html');
  } catch {
    return null;
  }
  let target: Element | null = null;
  try {
    target = document.querySelector(selector);
  } catch {
    return null;
  }
  if (!target || target.tagName.toLowerCase() !== 'img') return null;

  const current = target.getAttribute('src');
  if (current) {
    for (const quote of ['"', "'"]) {
      const attribute = `src=${quote}${current}${quote}`;
      if (occurrences(source, attribute) === 1) {
        return source.replace(attribute, `src="${escapeAttribute(dataUrl)}"`);
      }
    }
  }
  target.setAttribute('src', dataUrl);
  target.removeAttribute('srcset');
  return serialize(source, document);
}
