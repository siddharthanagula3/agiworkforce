import React, { useMemo, useState } from 'react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { useRichBlockCopy } from './RichBlockCard';
import {
  chartAxisMax,
  parseActions,
  parseCards,
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
  parseModes,
  parsePrompt,
  parseRadio,
  parseSlider,
  parseStatus,
  parseTimeline,
  parseTranscript,
  type ChartSurface,
  type CheckItem,
  type GalleryItem,
  type MapStop,
  type StatusRow,
} from './answerSurfaces';

const PANEL_CLASS =
  'my-4 overflow-clip rounded-[var(--chat-radius-lg)] border border-[var(--chat-border)] bg-[var(--chat-bg)]';
const BODY_CLASS = 'px-4 py-3 text-sm text-[var(--chat-text-primary)]';

function statusClass(state: StatusRow['state'] | 'complete' | 'progress' | 'todo'): string {
  if (state === 'passed' || state === 'complete') {
    return 'bg-[color-mix(in_srgb,var(--chat-success)_18%,transparent)] text-[var(--chat-success-text)]';
  }
  if (state === 'failed') {
    return 'bg-[color-mix(in_srgb,var(--chat-warning)_18%,transparent)] text-[var(--chat-warning-fg)]';
  }
  if (state === 'pending' || state === 'progress') {
    return 'bg-[color-mix(in_srgb,var(--chat-info)_18%,transparent)] text-[var(--chat-info-text)]';
  }
  return 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]';
}

function Pill({
  label,
  state,
}: {
  label: string;
  state: StatusRow['state'] | 'complete' | 'progress' | 'todo';
}) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusClass(state))}>
      {label}
    </span>
  );
}

function CopyAction({ text, label }: { text: string; label: string }) {
  const { copyState, copy } = useRichBlockCopy();
  const { t } = useUiTranslation('chat');
  const name =
    copyState === 'copied'
      ? t('answerSurface.copied', 'Copied')
      : copyState === 'failed'
        ? t('answerSurface.copyFailed', 'Copy failed')
        : label;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy(text)}>
      {name}
    </Button>
  );
}

function CheckList({
  title,
  items,
  showSummary,
}: {
  title: string;
  items: CheckItem[];
  showSummary: boolean;
}) {
  const { t } = useUiTranslation('chat');
  const [rows, setRows] = useState(items);
  const done = rows.filter((row) => row.checked).length;
  const toggle = (index: number) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, checked: !row.checked } : row,
      ),
    );
  const summary = rows
    .map(
      (row) =>
        `${row.label}: ${row.checked ? t('answerSurface.enabled', 'Enabled') : t('answerSurface.disabled', 'Disabled')}`,
    )
    .join('\n');
  return (
    <section className={PANEL_CLASS} data-answer-surface="checks" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--chat-border-subtle)] px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-[var(--chat-text-secondary)]">
          {t('answerSurface.progress', '{{done}} of {{total}}', { done, total: rows.length })}
        </span>
      </div>
      <ul className="flex flex-col gap-2 px-4 py-3">
        {rows.map((row, index) => (
          <li key={row.label}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={row.checked}
                onChange={() => toggle(index)}
                className="mt-0.5"
              />
              <span>{row.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {showSummary ? (
        <p className="border-t border-[var(--chat-border-subtle)] px-4 py-3 whitespace-pre-wrap text-sm text-[var(--chat-text-secondary)]">
          {summary}
        </p>
      ) : (
        <div className="flex gap-2 border-t border-[var(--chat-border-subtle)] px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows(items)}>
            {t('answerSurface.reset', 'Reset')}
          </Button>
          <CopyAction
            text={rows.map((row) => `${row.checked ? '[x]' : '[ ]'} ${row.label}`).join('\n')}
            label={t('answerSurface.copyChecklist', 'Copy checklist')}
          />
        </div>
      )}
    </section>
  );
}

function Gallery({ items }: { items: GalleryItem[] }) {
  const { t } = useUiTranslation('chat');
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;
  return (
    <section
      className={PANEL_CLASS}
      data-answer-surface="gallery"
      aria-label={t('answerSurface.gallery', 'Gallery')}
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {items.map((item, itemIndex) => (
          <figure
            key={`${item.caption}-${itemIndex}`}
            data-gallery-slide={itemIndex === index ? 'current' : 'idle'}
            className="min-w-0"
          >
            {item.color ? (
              <div
                role="img"
                aria-label={item.caption}
                data-gallery-swatch={item.color}
                className="aspect-square w-full rounded-lg border border-[var(--chat-border-subtle)]"
                style={{ backgroundColor: item.color }}
              />
            ) : (
              <img
                src={item.src}
                alt={item.caption}
                className="aspect-video w-full rounded-lg object-cover"
              />
            )}
            <figcaption className="mt-2 text-sm text-[var(--chat-text-secondary)]">
              {item.caption}
            </figcaption>
          </figure>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="flex justify-end border-t border-[var(--chat-border-subtle)] px-4 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIndex((currentIndex) => (currentIndex + 1) % items.length)}
          >
            {t('answerSurface.next', 'Next')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function mapTile(lat: number, lon: number): string {
  const zoom = 5;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function MapCard({ stops }: { stops: MapStop[] }) {
  const { t } = useUiTranslation('chat');
  const placed = stops.filter((stop) => stop.lat !== null && stop.lon !== null);
  const tile =
    placed.length > 0
      ? mapTile(
          placed.reduce((sum, stop) => sum + (stop.lat ?? 0), 0) / placed.length,
          placed.reduce((sum, stop) => sum + (stop.lon ?? 0), 0) / placed.length,
        )
      : null;
  return (
    <section
      className={PANEL_CLASS}
      data-answer-surface="map"
      aria-label={t('answerSurface.map', 'Map')}
    >
      {tile ? (
        <img
          src={tile}
          alt={t('answerSurface.mapImage', 'Map of the listed places')}
          data-map-tile=""
          className="h-48 w-full object-cover"
        />
      ) : null}
      <ol className="flex flex-col gap-2 px-4 py-3">
        {stops.map((stop) => (
          <li key={stop.name}>
            <span className="font-medium">{stop.name}</span>
            {stop.note ? (
              <span className="text-[var(--chat-text-secondary)]">: {stop.note}</span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="px-4 pb-3 text-xs text-[var(--chat-text-secondary)]">
        {t('answerSurface.mapCredit', 'Map data © OpenStreetMap')}
      </p>
    </section>
  );
}

function ChartCard({ chart }: { chart: ChartSurface }) {
  const axis = chartAxisMax(chart.points);
  return (
    <figure
      className={PANEL_CLASS}
      data-answer-surface="chart"
      data-answer-chart="1"
      aria-label={chart.title || chart.yLabel}
    >
      {chart.title ? (
        <figcaption className="px-4 pt-3 text-sm font-medium">{chart.title}</figcaption>
      ) : null}
      <div className="flex h-52 items-end gap-3 px-4 pt-6" data-chart-axis={axis}>
        {chart.points.map((point) => (
          <div key={point.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div
              className="w-full rounded-t bg-[var(--chat-info)]"
              style={{ height: `${Math.max(4, (point.value / axis) * 100)}%` }}
              title={`${point.label}: ${point.value}`}
              data-chart-bar={point.label}
              data-chart-value={point.value}
            />
            <span className="truncate text-center text-xs text-[var(--chat-text-secondary)]">
              {point.label}
            </span>
          </div>
        ))}
      </div>
      <table className="mt-3 w-full border-t border-[var(--chat-border-subtle)] text-sm">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left font-medium">{chart.xLabel}</th>
            <th className="px-4 py-2 text-left font-medium">{chart.yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {chart.points.map((point) => (
            <tr key={point.label}>
              <td className="px-4 py-1.5">{point.label}</td>
              <td className="px-4 py-1.5">{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function AnswerSurface({ language, source }: { language: string; source: string }) {
  const { t } = useUiTranslation('chat');
  const parsed = useMemo(() => source, [source]);

  if (language === 'cards' || language === 'modes') {
    const cards = language === 'modes' ? parseModes(parsed) : parseCards(parsed);
    if (cards.length === 0) return null;
    return (
      <section
        className={PANEL_CLASS}
        data-answer-surface={language}
        aria-label={
          language === 'modes'
            ? t('answerSurface.modes', 'Display modes')
            : t('answerSurface.cards', 'Cards')
        }
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-lg border border-[var(--chat-border-subtle)] p-3"
            >
              <h3 className="text-sm font-medium">{card.title}</h3>
              <p className="mt-1 text-sm text-[var(--chat-text-secondary)]">{card.body}</p>
            </article>
          ))}
        </div>
        {language === 'modes' ? (
          <p className="border-t border-[var(--chat-border-subtle)] px-4 py-3 text-sm text-[var(--chat-text-secondary)]">
            {t(
              'answerSurface.modesNote',
              'These cards describe display modes. They do not change this chat.',
            )}
          </p>
        ) : null}
      </section>
    );
  }

  if (language === 'radio') {
    const spec = parseRadio(parsed);
    if (!spec) return null;
    return <RadioCard spec={spec} />;
  }

  if (language === 'slider') {
    const spec = parseSlider(parsed);
    if (!spec) return null;
    return <SliderCard spec={spec} />;
  }

  if (language === 'checks') {
    const spec = parseChecks(parsed);
    if (!spec) return null;
    return <CheckList title={spec.title} items={spec.items} showSummary />;
  }

  if (language === 'checklist') {
    const spec = parseChecklist(parsed);
    if (!spec) return null;
    return <CheckList title={spec.title} items={spec.items} showSummary={false} />;
  }

  if (language === 'dropdown') {
    const spec = parseDropdown(parsed);
    if (!spec) return null;
    return <DropdownCard spec={spec} />;
  }

  if (language === 'gallery') {
    const items = parseGallery(parsed);
    if (items.length === 0) return null;
    return <Gallery items={items} />;
  }

  if (language === 'details') {
    const spec = parseDetails(parsed);
    if (!spec) return null;
    return (
      <details className={PANEL_CLASS} data-answer-surface="details">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{spec.summary}</summary>
        <p className="border-t border-[var(--chat-border-subtle)] px-4 py-3 text-sm whitespace-pre-wrap">
          {spec.body}
        </p>
      </details>
    );
  }

  if (language === 'map') {
    const stops = parseMap(parsed);
    if (stops.length === 0) return null;
    return <MapCard stops={stops} />;
  }

  if (
    language === 'prompt' ||
    language === 'commands' ||
    language === 'console' ||
    language === 'error'
  ) {
    const text = parsePrompt(parsed);
    if (!text) return null;
    const label =
      language === 'prompt'
        ? t('answerSurface.prompt', 'Prompt')
        : language === 'commands'
          ? t('answerSurface.commands', 'Commands')
          : language === 'console'
            ? t('answerSurface.console', 'Console output')
            : t('answerSurface.error', 'Error output');
    return (
      <section
        className={PANEL_CLASS}
        data-answer-surface={language}
        data-output-kind={language}
        aria-label={label}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--chat-border-subtle)] px-4 py-2">
          <h3 className="text-sm font-medium">{label}</h3>
          <CopyAction
            text={text}
            label={
              language === 'prompt'
                ? t('answerSurface.copyPrompt', 'Copy full prompt')
                : language === 'commands'
                  ? t('answerSurface.copyCommands', 'Copy commands')
                  : t('answerSurface.copy', 'Copy')
            }
          />
        </div>
        <pre
          className={cn(BODY_CLASS, 'overflow-x-auto whitespace-pre-wrap font-mono text-[13px]')}
        >
          {text}
        </pre>
        {language === 'commands' ? (
          <p className="border-t border-[var(--chat-border-subtle)] px-4 py-2 text-xs text-[var(--chat-text-secondary)]">
            {t(
              'answerSurface.notExecuted',
              'These commands are examples only; they have not been executed.',
            )}
          </p>
        ) : null}
      </section>
    );
  }

  if (language === 'status') {
    const rows = parseStatus(parsed);
    if (rows.length === 0) return null;
    const labels: Record<StatusRow['state'], string> = {
      passed: t('answerSurface.passed', 'Passed'),
      failed: t('answerSurface.failed', 'Failed'),
      pending: t('answerSurface.pending', 'Pending'),
      untested: t('answerSurface.notTested', 'Not tested'),
    };
    return (
      <ul
        className={cn(PANEL_CLASS, 'divide-y divide-[var(--chat-border-subtle)]')}
        data-answer-surface="status"
      >
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>{row.label}</span>
            <Pill label={labels[row.state]} state={row.state} />
          </li>
        ))}
      </ul>
    );
  }

  if (language === 'actions') {
    const actions = parseActions(parsed);
    if (actions.length === 0) return null;
    return (
      <div className="my-3 flex flex-wrap gap-2" data-answer-surface="actions">
        {actions.map((action) => (
          <CopyAction key={action.label} text={action.text} label={action.label} />
        ))}
      </div>
    );
  }

  if (language === 'followups') {
    const items = parseFollowups(parsed);
    if (items.length === 0) return null;
    return (
      <ul
        className={cn(PANEL_CLASS, 'divide-y divide-[var(--chat-border-subtle)]')}
        data-answer-surface="followups"
      >
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm hover:bg-[var(--chat-surface-hover)]"
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (language === 'files') {
    const files = parseFiles(parsed);
    if (files.length === 0) return null;
    return (
      <ul
        className={cn(PANEL_CLASS, 'divide-y divide-[var(--chat-border-subtle)]')}
        data-answer-surface="files"
      >
        {files.map((file) => (
          <li key={file.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block font-medium">{file.name}</span>
              {file.note ? (
                <span className="text-xs text-[var(--chat-text-secondary)]">{file.note}</span>
              ) : null}
            </span>
            <span className="rounded-full bg-[var(--chat-surface-hover)] px-2 py-0.5 text-xs uppercase">
              {file.kind}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (language === 'transcript') {
    const lines = parseTranscript(parsed);
    if (lines.length === 0) return null;
    return (
      <section
        className={PANEL_CLASS}
        data-answer-surface="transcript"
        aria-label={t('answerSurface.transcript', 'Transcript')}
      >
        <h3 className="border-b border-[var(--chat-border-subtle)] px-4 py-3 text-sm font-medium">
          {t('answerSurface.transcript', 'Transcript')}
        </h3>
        <ol className="flex flex-col gap-3 px-4 py-3">
          {lines.map((line) => (
            <li key={`${line.time}-${line.speaker}`}>
              <p className="text-xs text-[var(--chat-text-secondary)]">
                <span>{line.time}</span> <span className="font-medium">{line.speaker}</span>
              </p>
              <p className="text-sm">{line.text}</p>
            </li>
          ))}
        </ol>
        <p className="border-t border-[var(--chat-border-subtle)] px-4 py-2 text-xs text-[var(--chat-text-secondary)]">
          {t('answerSurface.notAudio', 'This is a transcript layout, not an audio player.')}
        </p>
      </section>
    );
  }

  if (language === 'timeline') {
    const steps = parseTimeline(parsed);
    if (steps.length === 0) return null;
    const labels = {
      complete: t('answerSurface.complete', 'Complete'),
      progress: t('answerSurface.inProgress', 'In progress'),
      todo: t('answerSurface.notStarted', 'Not started'),
    };
    return (
      <ol
        className={cn(PANEL_CLASS, 'flex flex-col gap-3 px-4 py-3')}
        data-answer-surface="timeline"
      >
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start justify-between gap-3">
            <span>
              <span className="font-medium">
                {index + 1}. {step.title}
              </span>
              {step.detail ? (
                <span className="mt-1 block text-sm text-[var(--chat-text-secondary)]">
                  {step.detail}
                </span>
              ) : null}
            </span>
            <Pill label={labels[step.state]} state={step.state} />
          </li>
        ))}
      </ol>
    );
  }

  if (language === 'citation') {
    const citation = parseCitation(parsed);
    if (!citation) return null;
    return (
      <article className={PANEL_CLASS} data-answer-surface="citation">
        <h3 className="px-4 pt-3 text-sm font-medium">{citation.title}</h3>
        {citation.source ? (
          <p className="px-4 text-xs text-[var(--chat-text-secondary)]">{citation.source}</p>
        ) : null}
        {citation.summary ? <p className="px-4 py-2 text-sm">{citation.summary}</p> : null}
        <p className="px-4 pb-3">
          <a href={citation.href} className="text-sm text-[var(--chat-info-text)] underline">
            {citation.href}
          </a>
        </p>
      </article>
    );
  }

  return null;
}

export function InlineChart({ source }: { source: string }) {
  const chart = parseChartSurface(source);
  if (!chart) return null;
  return <ChartCard chart={chart} />;
}

function RadioCard({ spec }: { spec: NonNullable<ReturnType<typeof parseRadio>> }) {
  const { t } = useUiTranslation('chat');
  const initial = spec.options.find((option) => option.selected)?.label ?? spec.options[0]!.label;
  const [selected, setSelected] = useState(initial);
  return (
    <fieldset className={PANEL_CLASS} data-answer-surface="radio">
      {spec.prompt ? (
        <legend className="px-4 pt-3 text-sm font-medium">{spec.prompt}</legend>
      ) : null}
      <div className="flex flex-col gap-2 px-4 py-3">
        {spec.options.map((option) => (
          <label key={option.label} className="flex items-center gap-2">
            <input
              type="radio"
              name={spec.prompt || 'answer-radio'}
              checked={selected === option.label}
              onChange={() => setSelected(option.label)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="border-t border-[var(--chat-border-subtle)] px-4 py-3 text-sm">
        {t('answerSurface.selected', 'Selected: {{value}}', { value: selected })}
      </p>
    </fieldset>
  );
}

function SliderCard({ spec }: { spec: NonNullable<ReturnType<typeof parseSlider>> }) {
  const [value, setValue] = useState(spec.value);
  return (
    <section className={PANEL_CLASS} data-answer-surface="slider" aria-label={spec.label}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <label htmlFor="answer-slider" className="text-sm">
          {spec.label}
        </label>
        <span className="text-lg font-medium" data-slider-value="">
          {spec.prefix}
          {value}
        </span>
      </div>
      <input
        id="answer-slider"
        className="mx-4 mb-4 w-[calc(100%-2rem)]"
        type="range"
        min={spec.min}
        max={spec.max}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />
    </section>
  );
}

function DropdownCard({ spec }: { spec: NonNullable<ReturnType<typeof parseDropdown>> }) {
  const { t } = useUiTranslation('chat');
  const [selected, setSelected] = useState(spec.selected);
  return (
    <section className={PANEL_CLASS} data-answer-surface="dropdown">
      <label className="flex flex-col gap-2 px-4 py-3 text-sm" htmlFor="answer-dropdown">
        {spec.label}
        <select
          id="answer-dropdown"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded-md border border-[var(--chat-border)] bg-transparent px-2 py-2"
        >
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <p className="border-t border-[var(--chat-border-subtle)] px-4 py-3 text-sm">
        {t('answerSurface.selected', 'Selected: {{value}}', { value: selected })}
      </p>
    </section>
  );
}
