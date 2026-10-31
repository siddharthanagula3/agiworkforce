import {
  checklistProgress,
  parseActions,
  parseCards,
  parseCardGrid,
  parseRichCard,
  parseStats,
  parseForm,
  parseCarousel,
  parseChartSurface,
  parseChecks,
  parseChecklist,
  parseCitation,
  parseDetails,
  parseDropdown,
  parseFiles,
  parseFollowups,
  parseGallery,
  parseMap,
  parsePrompt,
  parseRadio,
  parseSlider,
  parseStatus,
  parseTimeline,
  parseTool,
  parseTranscript,
  statusStateLabel,
  toolStateLabel,
  type CheckItem,
  type StatusRow,
  type ToolState,
  type RichCardSpec,
  type StatsSpec,
  type FormSpec,
  type CarouselSpec,
} from './answerSurfaces';
import { emailPlainText, parseEmailBlock, WRITING_KIND_LANGUAGES } from './richBlocks';
import { parseChartArtifact } from '@agiworkforce/types/chart-spec';

export { checklistProgress };
export type { AssistantFenceEdit } from './assistantFenceEdits';

export const UNKNOWN_STRUCTURED_LANGUAGE = 'unknown';

const SAFE_LINK = /^(?:https?:|mailto:)/i;

interface ChartSurfaceFields {
  title: string;
  xLabel: string;
  yLabel: string;
  points: { label: string; value: number }[];
}

export type AssistantFence =
  | { kind: 'code'; language: string; text: string }
  | { kind: 'fallback'; reason: 'invalid' | 'unknown'; language: string; text: string }
  | {
      kind: 'email';
      copyText: string;
      to: string;
      cc: string;
      bcc: string;
      subject: string;
      body: string;
    }
  | { kind: 'writing'; language: string; label: string; copyText: string }
  | {
      kind: 'copy';
      surface: 'prompt' | 'commands' | 'console' | 'error';
      title: string;
      copyText: string;
      notice: string;
    }
  | { kind: 'cards'; cards: { title: string; body: string }[] }
  | { kind: 'card'; spec: RichCardSpec }
  | { kind: 'stats'; spec: StatsSpec }
  | { kind: 'form'; spec: FormSpec; source: string }
  | { kind: 'carousel'; spec: CarouselSpec }
  | { kind: 'checklist'; title: string; items: CheckItem[]; progress: string }
  | ({ kind: 'chart' } & ChartSurfaceFields)
  | { kind: 'citation'; title: string; source: string; href: string; summary: string }
  | { kind: 'status'; rows: { label: string; state: StatusRow['state']; name: string }[] }
  | { kind: 'followups'; items: string[] }
  | { kind: 'radio'; prompt: string; options: { label: string; selected: boolean }[] }
  | { kind: 'slider'; label: string; min: number; max: number; value: number; prefix: string }
  | { kind: 'checks'; title: string; items: CheckItem[] }
  | { kind: 'dropdown'; label: string; options: string[]; selected: string }
  | { kind: 'gallery'; items: { caption: string; src: string; color: string }[] }
  | { kind: 'details'; summary: string; detail: string }
  | { kind: 'map'; stops: { name: string; note: string }[] }
  | { kind: 'actions'; items: { label: string; text: string }[] }
  | { kind: 'files'; files: { name: string; kind: string; note: string }[] }
  | { kind: 'transcript'; lines: { time: string; speaker: string; text: string }[] }
  | { kind: 'timeline'; steps: { title: string; detail: string; name: string }[] }
  | {
      kind: 'tool';
      name: string;
      state: ToolState;
      stateLabel: string;
      output: string;
      copyText: string;
    };

/**
 * A chart fence written as a full chart definition, with its own label and series keys, which
 * the web renderer plots with every series; surfaces that draw one series show the first.
 */
function chartFromSpec(source: string): ChartSurfaceFields | null {
  const parsed = parseChartArtifact(source);
  if (!parsed.ok) return null;
  const { spec } = parsed;
  const series = spec.series[0];
  if (!series) return null;
  const points = spec.rows.flatMap((row) => {
    const value = row[series.dataKey];
    const label = row[spec.xKey];
    return typeof value === 'number' && label !== undefined && label !== null
      ? [{ label: String(label), value }]
      : [];
  });
  if (points.length === 0) return null;
  return {
    title: spec.title ?? '',
    xLabel: spec.xLabel ?? spec.xKey,
    yLabel: spec.yLabel ?? series.name ?? series.dataKey,
    points,
  };
}

function fallback(reason: 'invalid' | 'unknown', language: string, source: string): AssistantFence {
  return { kind: 'fallback', reason, language, text: source.trim() };
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!SAFE_LINK.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function writingLabel(language: string): string {
  if (language === 'message') return 'Chat message';
  if (language === 'document') return 'Document';
  if (language === 'post') return 'Social post';
  if (language === 'snippet') return 'Snippet';
  return 'Writing';
}

export function classifyAssistantFence(language: string, source: string): AssistantFence {
  const normalized = language.trim().toLowerCase();
  if (normalized === UNKNOWN_STRUCTURED_LANGUAGE || normalized.startsWith('x-surface-')) {
    return fallback('unknown', normalized, source);
  }
  if (normalized === 'email') {
    const parsed = parseEmailBlock(source);
    if (!parsed) return fallback('invalid', normalized, source);
    return {
      kind: 'email',
      copyText: emailPlainText(parsed.draft),
      to: parsed.draft.to,
      cc: parsed.draft.cc,
      bcc: parsed.draft.bcc,
      subject: parsed.draft.subject,
      body: parsed.draft.body,
    };
  }
  if (WRITING_KIND_LANGUAGES.has(normalized) && normalized !== 'email') {
    const text = source;
    if (!text.trim()) return fallback('invalid', normalized, source);
    return {
      kind: 'writing',
      language: normalized,
      label: writingLabel(normalized),
      copyText: text,
    };
  }
  if (normalized === 'card') {
    const spec = parseRichCard(source);
    return spec ? { kind: 'card', spec } : fallback('invalid', normalized, source);
  }
  if (normalized === 'stats') {
    const spec = parseStats(source);
    return spec ? { kind: 'stats', spec } : fallback('invalid', normalized, source);
  }
  if (normalized === 'form') {
    const spec = parseForm(source);
    return spec ? { kind: 'form', spec, source } : fallback('invalid', normalized, source);
  }
  if (normalized === 'carousel') {
    const spec = parseCarousel(source);
    return spec ? { kind: 'carousel', spec } : fallback('invalid', normalized, source);
  }
  if (normalized === 'chart') {
    const chart = parseChartSurface(source) ?? chartFromSpec(source);
    if (!chart) return fallback('invalid', normalized, source);
    return { ...chart, kind: 'chart' };
  }
  if (normalized === 'tool') {
    const tool = parseTool(source);
    if (!tool) return fallback('invalid', normalized, source);
    return {
      kind: 'tool',
      name: tool.name,
      state: tool.state,
      stateLabel: toolStateLabel(tool.state),
      output: tool.output,
      copyText: tool.output,
    };
  }
  if (
    normalized === 'prompt' ||
    normalized === 'commands' ||
    normalized === 'console' ||
    normalized === 'error'
  ) {
    const text = parsePrompt(source);
    if (!text) return fallback('invalid', normalized, source);
    const title =
      normalized === 'prompt'
        ? 'Prompt'
        : normalized === 'commands'
          ? 'Commands'
          : normalized === 'console'
            ? 'Console output'
            : 'Error output';
    return {
      kind: 'copy',
      surface: normalized,
      title,
      copyText: text,
      notice:
        normalized === 'commands'
          ? 'These commands are examples only; they have not been executed.'
          : '',
    };
  }
  if (normalized === 'cards' || normalized === 'modes') {
    const cards =
      normalized === 'cards' ? (parseCardGrid(source)?.cards ?? []) : parseCards(source);
    if (cards.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'cards', cards };
  }
  if (normalized === 'checklist') {
    const spec = parseChecklist(source);
    if (!spec) return fallback('invalid', normalized, source);
    return {
      kind: 'checklist',
      title: spec.title,
      items: spec.items,
      progress: checklistProgress(spec.items),
    };
  }
  if (normalized === 'citation') {
    const citation = parseCitation(source);
    const href = citation ? safeHref(citation.href) : null;
    if (!citation || !href) return fallback('invalid', normalized, source);
    return { kind: 'citation', ...citation, href };
  }
  if (normalized === 'status') {
    const rows = parseStatus(source);
    if (rows.length === 0) return fallback('invalid', normalized, source);
    return {
      kind: 'status',
      rows: rows.map((row) => ({ ...row, name: statusStateLabel(row.state) })),
    };
  }
  if (normalized === 'followups') {
    const items = parseFollowups(source);
    if (items.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'followups', items };
  }
  if (normalized === 'radio') {
    const spec = parseRadio(source);
    if (!spec) return fallback('invalid', normalized, source);
    return { kind: 'radio', prompt: spec.prompt, options: spec.options };
  }
  if (normalized === 'slider') {
    const spec = parseSlider(source);
    if (!spec) return fallback('invalid', normalized, source);
    return { kind: 'slider', ...spec };
  }
  if (normalized === 'checks') {
    const spec = parseChecks(source);
    if (!spec) return fallback('invalid', normalized, source);
    return { kind: 'checks', title: spec.title, items: spec.items };
  }
  if (normalized === 'dropdown') {
    const spec = parseDropdown(source);
    if (!spec) return fallback('invalid', normalized, source);
    return { kind: 'dropdown', ...spec };
  }
  if (normalized === 'gallery') {
    const items = parseGallery(source).flatMap((item) => {
      const src = item.src && safeHref(item.src) ? item.src : '';
      if (!item.caption) return [];
      return [{ caption: item.caption, src, color: item.color }];
    });
    if (items.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'gallery', items };
  }
  if (normalized === 'details') {
    const spec = parseDetails(source);
    if (!spec) return fallback('invalid', normalized, source);
    return { kind: 'details', ...spec };
  }
  if (normalized === 'map') {
    const stops = parseMap(source);
    if (stops.length === 0) return fallback('invalid', normalized, source);
    return {
      kind: 'map',
      stops: stops.map((stop) => ({ name: stop.name, note: stop.note })),
    };
  }
  if (normalized === 'actions') {
    const items = parseActions(source);
    if (items.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'actions', items };
  }
  if (normalized === 'files') {
    const files = parseFiles(source);
    if (files.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'files', files };
  }
  if (normalized === 'transcript') {
    const lines = parseTranscript(source);
    if (lines.length === 0) return fallback('invalid', normalized, source);
    return { kind: 'transcript', lines };
  }
  if (normalized === 'timeline') {
    const steps = parseTimeline(source);
    if (steps.length === 0) return fallback('invalid', normalized, source);
    const name = (state: (typeof steps)[number]['state']) =>
      state === 'complete' ? 'Complete' : state === 'progress' ? 'In progress' : 'Not started';
    return {
      kind: 'timeline',
      steps: steps.map((step) => ({
        title: step.title,
        detail: step.detail,
        name: name(step.state),
      })),
    };
  }
  return { kind: 'code', language: normalized, text: source };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type FenceHtmlMode = 'vscode' | 'chrome';

function sectionOpen(mode: FenceHtmlMode, surface: string, label: string): string {
  if (mode === 'chrome') {
    return `<section data-lang="surface:${escapeHtml(surface)}" title="${escapeHtml(label)}">`;
  }
  return `<section class="answer-surface answer-surface-${escapeHtml(surface)}" aria-label="${escapeHtml(label)}">`;
}

function copyButton(mode: FenceHtmlMode, label: string): string {
  if (mode === 'chrome') return '';
  return `<button type="button" class="surface-copy" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function copyBody(text: string): string {
  return `<pre class="answer-copy"><code>${escapeHtml(text)}</code></pre>`;
}

export function renderClassifiedFenceHtml(
  fence: AssistantFence,
  mode: FenceHtmlMode,
): string | null {
  if (fence.kind === 'code') return null;
  if (fence.kind === 'fallback') {
    return `<p data-answer-fallback="${escapeHtml(fence.reason)}">${escapeHtml(fence.text)}</p>`;
  }
  if (fence.kind === 'card') {
    return `${sectionOpen(mode, 'card', fence.spec.title)}<h3>${escapeHtml(fence.spec.title)}</h3><p>${escapeHtml(fence.spec.subtitle)}</p><p>${escapeHtml(fence.spec.tags.join(', '))}</p>${copyBody(fence.spec.body)}</section>`;
  }
  if (fence.kind === 'stats') {
    const items = fence.spec.items
      .map(
        (item) =>
          `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml([item.value, item.caption, item.tag].filter(Boolean).join(' · '))}</dd>`,
      )
      .join('');
    return `${sectionOpen(mode, 'stats', fence.spec.title || 'Statistics')}<h3>${escapeHtml(fence.spec.title)}</h3><dl>${items}</dl></section>`;
  }
  if (fence.kind === 'form') {
    return `${sectionOpen(mode, 'form', fence.spec.title)}<h3>${escapeHtml(fence.spec.title)}</h3><p>Form controls are unavailable in this surface.</p>${copyBody(fence.source)}${copyButton(mode, 'Copy form definition')}</section>`;
  }
  if (fence.kind === 'carousel') {
    const items = fence.spec.items
      .map(
        (item) =>
          `<article><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text)}</p></article>`,
      )
      .join('');
    return `${sectionOpen(mode, 'carousel', fence.spec.title)}<h3>${escapeHtml(fence.spec.title)}</h3>${items}</section>`;
  }
  if (fence.kind === 'email') {
    return `${sectionOpen(mode, 'email', 'Email')}<h3>Email</h3>${copyBody(fence.copyText)}${copyButton(mode, 'Copy email')}</section>`;
  }
  if (fence.kind === 'writing') {
    const notice =
      '<p class="answer-preview-note">Edits stay in this preview. Copy to keep them.</p>';
    if (mode === 'vscode') {
      return `${sectionOpen(mode, 'writing', fence.label)}<h3>${escapeHtml(fence.label)}</h3><textarea aria-label="${escapeHtml(fence.label)}">${escapeHtml(fence.copyText)}</textarea>${copyButton(mode, 'Copy draft')}${notice}</section>`;
    }
    return `${sectionOpen(mode, 'writing', fence.label)}<h3>${escapeHtml(fence.label)}</h3>${copyBody(fence.copyText)}${notice}</section>`;
  }
  if (fence.kind === 'copy') {
    const copyLabel =
      fence.surface === 'prompt'
        ? 'Copy full prompt'
        : fence.surface === 'commands'
          ? 'Copy commands'
          : 'Copy';
    const notice = fence.notice ? `<p>${escapeHtml(fence.notice)}</p>` : '';
    return `${sectionOpen(mode, fence.surface, fence.title)}<h3>${escapeHtml(fence.title)}</h3>${copyBody(fence.copyText)}${notice}${copyButton(mode, copyLabel)}</section>`;
  }
  if (fence.kind === 'cards') {
    const articles = fence.cards
      .map(
        (card) =>
          `<article><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p></article>`,
      )
      .join('');
    return `${sectionOpen(mode, 'cards', 'Cards')}${articles}</section>`;
  }
  if (fence.kind === 'checklist') {
    const items = fence.items
      .map((item) => {
        const token = item.checked ? 'surface:checked' : 'surface:check';
        if (mode === 'chrome') {
          return `<li data-lang="${token}">${escapeHtml(item.label)}</li>`;
        }
        const pressed = item.checked ? 'true' : 'false';
        return `<li><button type="button" class="surface-check" aria-pressed="${pressed}" aria-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button></li>`;
      })
      .join('');
    const progress =
      mode === 'chrome'
        ? `<p data-lang="surface:progress">${escapeHtml(fence.progress)}</p>`
        : `<p class="answer-progress">${escapeHtml(fence.progress)}</p>`;
    return `${sectionOpen(mode, 'checklist', fence.title)}<h3>${escapeHtml(fence.title)}</h3>${progress}<ul>${items}</ul></section>`;
  }
  if (fence.kind === 'chart') {
    const rows = fence.points
      .map(
        (point) =>
          `<tr><td>${escapeHtml(point.label)}</td><td>${escapeHtml(String(point.value))}</td></tr>`,
      )
      .join('');
    const summary = fence.points.map((point) => `${point.label} ${point.value}`).join(', ');
    return `${sectionOpen(mode, 'chart', fence.title || 'Chart')}<h3>${escapeHtml(fence.title || 'Chart')}</h3><p>${escapeHtml(summary)}</p><table><thead><tr><th>${escapeHtml(fence.xLabel)}</th><th>${escapeHtml(fence.yLabel)}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }
  if (fence.kind === 'citation') {
    return `${sectionOpen(mode, 'citation', fence.title)}<h3>${escapeHtml(fence.title)}</h3><p>${escapeHtml(fence.source)}</p><p>${escapeHtml(fence.summary)}</p><p><a href="${escapeHtml(fence.href)}">Read documentation</a></p></section>`;
  }
  if (fence.kind === 'status') {
    const rows = fence.rows
      .map((row) => `<li>${escapeHtml(row.label)}: ${escapeHtml(row.name)}</li>`)
      .join('');
    return `${sectionOpen(mode, 'status', 'Status')}<ul>${rows}</ul></section>`;
  }
  if (fence.kind === 'radio') {
    const options = fence.options
      .map(
        (option) => `<li>${escapeHtml(option.label)}${option.selected ? ' (selected)' : ''}</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'radio', fence.prompt || 'Choices')}<h3>${escapeHtml(fence.prompt || 'Choices')}</h3><ul>${options}</ul></section>`;
  }
  if (fence.kind === 'slider') {
    const shown = `${fence.prefix}${fence.value}`;
    return `${sectionOpen(mode, 'slider', fence.label)}<h3>${escapeHtml(fence.label)}</h3><p>${escapeHtml(shown)} (${escapeHtml(String(fence.min))} to ${escapeHtml(String(fence.max))})</p></section>`;
  }
  if (fence.kind === 'checks') {
    const items = fence.items
      .map((item) => `<li>${escapeHtml(item.label)}: ${item.checked ? 'Enabled' : 'Disabled'}</li>`)
      .join('');
    return `${sectionOpen(mode, 'checks', fence.title)}<h3>${escapeHtml(fence.title)}</h3><ul>${items}</ul></section>`;
  }
  if (fence.kind === 'dropdown') {
    const options = fence.options
      .map(
        (option) =>
          `<li>${escapeHtml(option)}${option === fence.selected ? ' (selected)' : ''}</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'dropdown', fence.label)}<h3>${escapeHtml(fence.label)}</h3><ul>${options}</ul></section>`;
  }
  if (fence.kind === 'gallery') {
    const items = fence.items
      .map((item) => {
        const link = item.src
          ? `<a href="${escapeHtml(item.src)}">${escapeHtml(item.caption)}</a>`
          : escapeHtml(item.caption);
        const swatch = item.color ? ` ${escapeHtml(item.color)}` : '';
        return `<li>${link}${swatch}</li>`;
      })
      .join('');
    return `${sectionOpen(mode, 'gallery', 'Gallery')}<ul>${items}</ul></section>`;
  }
  if (fence.kind === 'details') {
    return `${sectionOpen(mode, 'details', fence.summary)}<h3>${escapeHtml(fence.summary)}</h3><p>${escapeHtml(fence.detail)}</p></section>`;
  }
  if (fence.kind === 'map') {
    const stops = fence.stops
      .map(
        (stop) =>
          `<li>${escapeHtml(stop.name)}${stop.note ? `: ${escapeHtml(stop.note)}` : ''}</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'map', 'Map')}<ul>${stops}</ul><p>Place names are listed. A map image is not loaded in this view.</p></section>`;
  }
  if (fence.kind === 'actions') {
    const items = fence.items
      .map(
        (item) =>
          `<h3>${escapeHtml(item.label)}</h3>${copyBody(item.text)}${copyButton(mode, item.label)}`,
      )
      .join('');
    return `${sectionOpen(mode, 'actions', 'Actions')}${items}</section>`;
  }
  if (fence.kind === 'files') {
    const files = fence.files
      .map(
        (file) =>
          `<li>${escapeHtml(file.name)} (${escapeHtml(file.kind)})${file.note ? `: ${escapeHtml(file.note)}` : ''}</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'files', 'Files')}<ul>${files}</ul></section>`;
  }
  if (fence.kind === 'transcript') {
    const lines = fence.lines
      .map(
        (line) =>
          `<li>${escapeHtml(line.time)} ${escapeHtml(line.speaker)}: ${escapeHtml(line.text)}</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'transcript', 'Transcript')}<ul>${lines}</ul><p>This is a transcript layout, not an audio player.</p></section>`;
  }
  if (fence.kind === 'timeline') {
    const steps = fence.steps
      .map(
        (step, index) =>
          `<li>${index + 1}. ${escapeHtml(step.title)}${step.detail ? `: ${escapeHtml(step.detail)}` : ''} (${escapeHtml(step.name)})</li>`,
      )
      .join('');
    return `${sectionOpen(mode, 'timeline', 'Timeline')}<ol>${steps}</ol></section>`;
  }
  if (fence.kind === 'followups') {
    const items = fence.items
      .map((item) =>
        mode === 'chrome'
          ? `<li data-lang="surface:followup">${escapeHtml(item)}</li>`
          : `<button type="button" class="surface-followup">${escapeHtml(item)}</button>`,
      )
      .join('');
    return `${sectionOpen(mode, 'followups', 'Follow-ups')}${items}</section>`;
  }
  const completed = fence.stateLabel === 'Completed' ? 'Completed' : fence.stateLabel;
  return `${sectionOpen(mode, 'tool', 'Tool result')}<h3>${escapeHtml(fence.name)}</h3><p>${escapeHtml(completed)}</p>${copyBody(fence.copyText)}</section>`;
}

export const MIXED_ASSISTANT_REPLY = [
  'Here is the plan in ordinary prose.',
  '',
  '```email',
  'To: ada@example.com',
  'Subject: Review',
  '',
  'Please review the build.',
  '```',
  '',
  '```ts',
  'const ready = true;',
  '```',
  '',
  '```prompt',
  'Inspect the application.',
  '```',
  '',
  '```commands',
  'pnpm test',
  '```',
  '',
  '```status',
  'Authentication | Passed',
  'Payment processing | Failed',
  'Email verification | Pending',
  '```',
  '',
  '| Plan | Price |',
  '| --- | --- |',
  '| Basic | Free |',
  '',
  '```chart',
  'title: Requests',
  'x: Month',
  'y: Requests',
  'Jan | 10',
  'Feb | 30',
  '```',
  '',
  '```checklist',
  'title: QA Checklist',
  '- [ ] Verify chat rendering',
  '- [x] Verify copy button',
  '```',
  '',
  '```citation',
  'title: Writing blocks',
  'source: Documentation',
  'url: https://example.com/docs',
  'summary: How drafts render.',
  '```',
  '',
  '```tool',
  'name: tests',
  'state: failed',
  '2 assertions failed',
  '```',
  '',
  '```followups',
  '- Show the document',
  '```',
  '',
  '```citation',
  'title: Missing the address',
  '```',
  '',
  '```unknown',
  'A widget this client does not draw.',
  '```',
  '',
  'A numbered explanation stays prose.',
  '',
  '1. Open the application.',
  '2. Sign in.',
  '',
  '[bad](javascript:alert(1))',
].join('\n');

export const MIXED_REPLY_THROUGH_EMAIL = MIXED_ASSISTANT_REPLY.slice(
  0,
  MIXED_ASSISTANT_REPLY.indexOf('```ts'),
);
