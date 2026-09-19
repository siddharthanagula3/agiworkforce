'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import ReactMarkdown from 'react-markdown';

import { Prose, Stack } from '@/features/marketing/components/system';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

import type { HelpSearchResult } from '@/app/api/help/search/route';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; results: HelpSearchResult[] }
  | { kind: 'empty' }
  | { kind: 'unavailable' }
  | { kind: 'error' };

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export function HelpSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback(async (text: string) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ kind: 'searching' });

    try {
      const response = await fetch(`/api/help/search?q=${encodeURIComponent(text)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (controller.signal.aborted) return;
      if (response.status === 503) {
        setState({ kind: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setState({ kind: 'error' });
        return;
      }
      const body = (await response.json()) as { results?: HelpSearchResult[] };
      if (controller.signal.aborted) return;
      const results = body.results ?? [];
      setState(results.length > 0 ? { kind: 'results', results } : { kind: 'empty' });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    inFlight.current?.abort();
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      inFlight.current?.abort();
      setState({ kind: 'idle' });
      return;
    }
    const timer = setTimeout(() => void run(text), DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      inFlight.current?.abort();
    };
  }, [query, run]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const isSearching = state.kind === 'searching';
  const isError = state.kind === 'error';
  const isUnavailable = state.kind === 'unavailable';

  return (
    <Stack gap="loose">
      <div className="agi-ds-field">
        <label className="agi-ds-field-label" htmlFor={inputId}>
          Search the help centre
        </label>
        <input
          id={inputId}
          className="agi-ds-input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Billing, local models, bring your own key"
          value={query}
          onChange={(event) => {
            inFlight.current?.abort();
            setState({ kind: 'idle' });
            setQuery(event.target.value);
          }}
          aria-describedby={statusId}
        />
      </div>

      {/* One live region for every outcome, so a screen reader hears the result
          count change rather than only seeing the list appear. */}
      <div id={statusId} role="status" aria-live="polite">
        {isSearching ? (
          <span className="agi-ds-field-label" style={{ display: 'inline-flex', gap: '0.5rem' }}>
            <Spinner size="sm" aria-hidden="true" />
            Searching
          </span>
        ) : null}
        {state.kind === 'results' ? (
          <Prose size="sm">
            {state.results.length === 1
              ? '1 page matches.'
              : `${state.results.length} pages match.`}
          </Prose>
        ) : null}
        {state.kind === 'empty' ? (
          <Prose size="sm">
            Nothing here covers that yet. Email contact@agiworkforce.com for support.
          </Prose>
        ) : null}
        {isUnavailable ? (
          <Prose size="sm">
            Search is not answering right now. The links below still work, and you can email
            contact@agiworkforce.com for support.
          </Prose>
        ) : null}
        {isError ? (
          <Prose size="sm">
            That search did not go through. Try again, or email contact@agiworkforce.com.
          </Prose>
        ) : null}
      </div>

      {state.kind === 'results' ? (
        <LinkGrid
          items={state.results.map((result) => ({
            meta: result.category,
            title: result.title,
            href: result.path,
            body: (
              <ReactMarkdown
                allowedElements={['strong', 'em', 'code', 'br']}
                unwrapDisallowed
                skipHtml
              >
                {result.snippet}
              </ReactMarkdown>
            ),
          }))}
        />
      ) : null}
    </Stack>
  );
}
