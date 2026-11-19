export function splitSlides(raw: string): string[] {
  const content = raw.replace(/\r\n/g, '\n').trim();
  if (!content) return [];

  const parts = content.split(/\n[ \t]*-{3,}[ \t]*\n/);
  if (parts.length > 1) {
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  const lines = content.split('\n');
  const slideChunks: string[] = [];
  let currentChunk: string[] = [];

  lines.forEach((line) => {
    if ((line.startsWith('# ') || line.startsWith('## ')) && currentChunk.length > 0) {
      slideChunks.push(currentChunk.join('\n'));
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }
  });
  if (currentChunk.length > 0) slideChunks.push(currentChunk.join('\n'));

  return slideChunks.map((s) => s.trim()).filter(Boolean);
}
