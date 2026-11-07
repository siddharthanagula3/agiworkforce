import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import type { InteractiveCard } from '@agiworkforce/types';
import { readGeneratedFigureIdentity } from '@agiworkforce/cloud-contracts';

export interface TurnArtifact {
  id: string;
  type: string;
  language?: string;
  title?: string;
  content: string;
}

const DOCUMENT_REQUEST = /editable document/i;
const LOGO_REQUEST = /logo|visual design concept|gallery|carousel/i;
const BLUE_SQUARE = /blue square/i;
const IMAGE_FAILURE =
  /could not be generated|couldn't generate|unable to generate|images could not/i;

function headingLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => /^(?:#{1,3}\s+)(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => Boolean(line));
}

function normalizeBoldSections(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const bold = /^\s*\*\*([^*]+)\*\*\s*$/.exec(line);
      return bold?.[1] ? `## ${bold[1].trim()}` : line;
    })
    .join('\n');
}

/**
 * An editable-document request that came back as chat markdown still opens as
 * a document artifact. A reply that already carries a marked markdown artifact
 * is left to the normal derivation path.
 */
export function editableDocumentFromReply(
  userText: string,
  assistant: string,
): { title: string; content: string } | null {
  if (!DOCUMENT_REQUEST.test(userText)) return null;
  if (/```(?:markdown|md)\b[\s\S]*<!--\s*@artifact\s*-->/i.test(assistant)) return null;
  const normalized = normalizeBoldSections(assistant);
  const lines = normalized.split('\n');
  const start = lines.findIndex((line) => /^#{1,3}\s+\S/.test(line));
  if (start < 0) return null;
  const content = lines.slice(start).join('\n').trim();
  const headings = headingLines(content);
  if (headings.length < 2) return null;
  return { title: headings[0] ?? 'Document', content };
}

const CONCEPTS = [
  {
    name: 'Solid',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Solid blue square"><rect x="40" y="40" width="120" height="120" fill="royalblue"/></svg>',
  },
  {
    name: 'Rounded',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Rounded blue square"><rect x="36" y="36" width="128" height="128" rx="28" fill="mediumblue"/><rect x="68" y="68" width="64" height="64" rx="12" fill="lightsteelblue"/></svg>',
  },
  {
    name: 'Outline',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Outlined blue square"><rect x="40" y="40" width="120" height="120" fill="none" stroke="cornflowerblue" stroke-width="14"/></svg>',
  },
] as const;

export function blueSquareConceptDocument(): string {
  const slides = CONCEPTS.map(
    (concept, index) =>
      `<section class="slide${index === 0 ? ' active' : ''}" data-concept="${concept.name}"><p>${concept.name}</p>${concept.svg}</section>`,
  ).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Blue square logo concepts</title>
<style>
  body { margin: 0; background: black; color: white; font-family: sans-serif; }
  h1 { font-size: 1.1rem; margin: 16px; }
  .stage { min-height: 280px; display: grid; place-items: center; }
  .slide { display: none; text-align: center; }
  .slide.active { display: block; }
  .slide p { margin: 0 0 12px; }
  .controls { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 20px; }
  button { min-height: 44px; min-width: 72px; }
</style>
</head>
<body>
<h1>Blue square logo concepts</h1>
<div class="stage">${slides}</div>
<div class="controls">
  <button type="button" id="prev">Prev</button>
  <span id="page">1 / ${CONCEPTS.length}</span>
  <button type="button" id="next">Next</button>
</div>
<script>
  const slides = Array.from(document.querySelectorAll('.slide'));
  let index = 0;
  const page = document.getElementById('page');
  function show(next) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
    if (page) page.textContent = (index + 1) + ' / ' + slides.length;
    document.getElementById('prev').disabled = index === 0;
    document.getElementById('next').disabled = index === slides.length - 1;
  }
  document.getElementById('prev').addEventListener('click', () => show(index - 1));
  document.getElementById('next').addEventListener('click', () => show(index + 1));
  show(0);
</script>
</body>
</html>`;
}

function hasSvgFence(assistant: string): boolean {
  return /```(?:svg|xml)?\s*\n[\s\S]*?<svg\b/i.test(assistant);
}

export function logoConceptArtifact(input: {
  userText: string;
  assistant: string;
  artifacts: readonly TurnArtifact[];
  conversationId?: string;
  messageId?: string;
}): TurnArtifact | null {
  if (!LOGO_REQUEST.test(input.userText) || !BLUE_SQUARE.test(input.userText)) return null;
  if (hasSvgFence(input.assistant)) return null;
  if (input.artifacts.some((artifact) => /<svg\b/i.test(artifact.content))) return null;
  const emptyGallery = input.artifacts.some(
    (artifact) =>
      artifact.type === 'html' &&
      !/<svg\b/i.test(artifact.content) &&
      (/<img\b/i.test(artifact.content) || /carousel|slide/i.test(artifact.content)),
  );
  if (!IMAGE_FAILURE.test(input.assistant) && !emptyGallery) return null;
  const existing = input.artifacts.find((artifact) => artifact.type === 'html');
  return {
    id:
      existing?.id ??
      computeDerivedArtifactId(input.conversationId, `${input.messageId ?? ''}:logo-concepts`, 0),
    type: 'html',
    language: 'html',
    title: existing?.title || 'Blue square logo concepts',
    content: blueSquareConceptDocument(),
  };
}

interface GeneratedImageIdentity {
  id: string;
  uri: string;
  kind?: string;
  mimeType: string;
  checksumSha256?: string;
  renderIdentity?: string;
}

export function groupGeneratedImageOutputs<T extends GeneratedImageIdentity>(
  files: readonly T[],
): { images: T[]; aliases: T[] } {
  const seen = new Set<string>();
  const images: T[] = [];
  const aliases: T[] = [];
  for (const file of files) {
    if (file.kind !== 'image') continue;
    const identities = [`id:${file.id}`, `uri:${file.uri}`];
    const renderIdentity = readGeneratedFigureIdentity(file.renderIdentity);
    if (renderIdentity) identities.push(`render:${renderIdentity}`);
    if (/^[a-f\d]{64}$/i.test(file.checksumSha256 ?? ''))
      identities.push(`sha256:${file.mimeType}:${file.checksumSha256?.toLowerCase()}`);
    if (identities.some((identity) => seen.has(identity))) aliases.push(file);
    else images.push(file);
    identities.forEach((identity) => seen.add(identity));
  }
  return { images, aliases };
}

export function imageCardModelId(
  cards: readonly InteractiveCard[] | undefined,
): string | undefined {
  for (const card of cards ?? []) {
    if (card.recognized && card.kind === 'image.v1' && card.body.model) return card.body.model;
  }
  return undefined;
}

export function interactiveCardsForTurn<T extends { recognized: boolean; kind: string }>(
  cards: readonly T[],
  turnFailed: boolean,
): T[] {
  if (!turnFailed) return [...cards];
  return cards.filter((card) => !(card.recognized && card.kind === 'map-search.v1'));
}
