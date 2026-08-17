import {
  buildAiActProvenanceClaim,
  serialiseAiActProvenanceClaim,
  type AiActProvenanceClaim,
  type SyntheticContentKind,
} from '@agiworkforce/types';

export type { SyntheticContentKind };

export type C2paStyleClaim = AiActProvenanceClaim;

export const buildProvenanceClaim = buildAiActProvenanceClaim;

export const serialiseClaim = serialiseAiActProvenanceClaim;

export function renderAiGeneratedMetaTag(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  generatedAt?: string;
}): string {
  const provider = escapeHtmlAttribute(args.provider);
  const model = escapeHtmlAttribute(args.model);
  const kind = escapeHtmlAttribute(args.kind);
  const generatedAt = escapeHtmlAttribute(args.generatedAt ?? new Date().toISOString());
  return `<meta name="agi:ai-generated" content="true" data-kind="${kind}" data-provider="${provider}" data-model="${model}" data-generated-at="${generatedAt}">`;
}

export function injectAiGeneratedMetaTag(args: {
  html: string;
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  generatedAt?: string;
}): string {
  const tag = renderAiGeneratedMetaTag({
    kind: args.kind,
    provider: args.provider,
    model: args.model,
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  const stripped = args.html.replace(
    /<meta[ \t]{1,32}name="agi:ai-generated"[^>]{0,2048}>[ \t\r\n]{0,32}/gi,
    '',
  );

  const headMatch = stripped.match(/<head[^>]*>/i);
  if (headMatch) {
    const insertAt = (headMatch.index ?? 0) + headMatch[0].length;
    return stripped.slice(0, insertAt) + '\n  ' + tag + stripped.slice(insertAt);
  }

  return tag + '\n' + stripped;
}

export function wrapTextExportWithMarker(args: {
  text: string;
  provider: string;
  model: string;
  generatedAt?: string;
  contentHashSha256?: string;
}): string {
  const claim = buildProvenanceClaim({
    kind: 'text',
    provider: args.provider,
    model: args.model,
    ...(args.contentHashSha256 !== undefined ? { contentHashSha256: args.contentHashSha256 } : {}),
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  const sidecar = `<!-- agi:ai-generated:c2pa-claim ${serialiseClaim(claim)} -->`;
  const metaTag = renderAiGeneratedMetaTag({
    kind: 'text',
    provider: args.provider,
    model: args.model,
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  return `${sidecar}\n${args.text}\n${metaTag}\n`;
}

export function hasAiGeneratedMarker(payload: string): boolean {
  if (/<meta\s+name="agi:ai-generated"/i.test(payload)) return true;
  if (/agi:ai-generated:c2pa-claim/i.test(payload)) return true;
  return false;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
