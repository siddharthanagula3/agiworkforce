import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getProviderOfferings, providerOfferingLabel } from '@agiworkforce/types';
import type {
  FreeQuotaCatalogue,
  FreeQuotaModel,
  FreeQuotaStatus,
} from '@/features/models/lib/free-quota-types';
import type {
  FreeModelSource,
  FreeModelSources,
} from '@features/chat/hooks/use-free-model-sources';
import { FreeQuotaModelSection } from './FreeQuotaModelSection';

const FALLBACK = 'Fallback Fixture';
const ISSUER = 'Fixture Cloud';
const DATED_ID = /-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/;

const offerings = getProviderOfferings();
const chatKeys = Object.entries(offerings)
  .filter(([, offering]) => offering.category === 'chat' && offering.quotaProbeProtocol === 'chat')
  .map(([key]) => key);
const byFamily = new Map<string, string[]>();
for (const key of chatKeys) {
  const family = providerOfferingLabel(key)!.family;
  byFamily.set(family, [...(byFamily.get(family) ?? []), key]);
}
const [familyA, familyB] = [...byFamily.values()]
  .filter((keys) => keys.length >= 2)
  .sort((left, right) => right.length - left.length) as [string[], string[]];
const datedKey = chatKeys.find((key) => {
  const offering = offerings[key]!;
  return (
    DATED_ID.test(offering.providerModelId ?? '') &&
    offering.displayName === offering.providerModelId
  );
})!;
const experientialKeys = chatKeys.filter((key) => offerings[key]!.provider === 'experientiallabs');
const experientialKey = experientialKeys[0]!;
const DATA_USE_NOTE = /providers have not said they keep prompts out of training/;
const PROMOTION_DESCRIPTION =
  'Free promotion · text chat · provider quota applies These models get only your messages, not your instructions or memory: their providers have not said they keep prompts out of training.';
const imageKeys = Object.entries(offerings)
  .filter(
    ([, offering]) => offering.category === 'image' && offering.quotaProbeProtocol === 'image-sync',
  )
  .map(([key]) => key);
const imageKey = imageKeys[0]!;
const videoKey = Object.entries(offerings).find(
  ([, offering]) => offering.category === 'video' && offering.quotaProbeProtocol === 'video-async',
)![0];

function name(key: string): string {
  return providerOfferingLabel(key)!.displayName;
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calendarDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function model(key: string, status: FreeQuotaStatus = 'ready'): FreeQuotaModel {
  const offering = offerings[key]!;
  return {
    key,
    displayName: offering.displayName,
    providerModelId: offering.providerModelId,
    category: offering.category,
    limit: null,
    unit: null,
    consumedApproximate: null,
    expiresOn: status === 'expired' ? '2026-08-22' : null,
    status,
  };
}

function catalogue(models: FreeQuotaModel[], issuer = ISSUER): FreeQuotaCatalogue {
  return {
    issuer,
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: models.length,
    reportedUnavailable: 0,
    models,
  };
}

function source(
  status: FreeModelSource['status'],
  value: FreeQuotaCatalogue | null = null,
): FreeModelSource {
  return { status, catalogue: value, retry: vi.fn() };
}

function sources(
  quota: FreeModelSource,
  experiential: FreeModelSource = source('hidden'),
): FreeModelSources {
  return { quota, experiential };
}

function renderSection(
  value: FreeModelSources,
  options: { selectedId?: string; onSelect?: (id: string) => void } = {},
) {
  const onSelect = options.onSelect ?? vi.fn();
  render(
    <FreeQuotaModelSection
      sources={value}
      selectedId={options.selectedId ?? 'auto'}
      onSelect={onSelect}
      fallback={{
        name: FALLBACK,
        row: (
          <button type="button" data-picker-row="">
            {FALLBACK}
          </button>
        ),
      }}
    />,
  );
  return onSelect;
}

describe('Free section in the composer', () => {
  it('shows one ready model per family and puts the rest behind More models', () => {
    const models = [...familyA, ...familyB].map((key) => model(key));
    const onSelect = renderSection(sources(source('ready', catalogue(models))));

    const featured = within(screen.getByRole('group', { name: `${ISSUER} free models` }))
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'));
    expect(featured).toHaveLength(2);
    const more = screen.getByRole('button', { name: /More models/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveTextContent(String(models.length - 2));
    expect(screen.queryByRole('group', { name: 'More free models' })).not.toBeInTheDocument();

    fireEvent.click(more);
    const expanded = screen.getByRole('group', { name: 'More free models' });
    expect(within(expanded).getAllByRole('button')).toHaveLength(models.length - 2);

    const [first] = within(expanded).getAllByRole('button');
    fireEvent.click(first!);
    expect(onSelect).toHaveBeenCalledWith(
      models.find((entry) => name(entry.key) === first!.getAttribute('aria-label'))!.key,
    );
  });

  it('heads each model line in More models, not the vendor', () => {
    renderSection(sources(source('ready', catalogue(familyA.map((key) => model(key))))));
    const featured = within(screen.getByRole('group', { name: `${ISSUER} free models` }))
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'));
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const expanded = screen.getByRole('group', { name: 'More free models' });

    const lines = familyA
      .filter((key) => !featured.includes(name(key)))
      .map((key) => providerOfferingLabel(key)!.line);
    const headings = [...expanded.querySelectorAll('p')].map((heading) => heading.textContent);
    expect(new Set(lines).size).toBeGreaterThan(1);
    expect([...headings].sort()).toEqual([...new Set(lines)].sort());
    for (const heading of expanded.querySelectorAll('p')) {
      const rows = [...heading.parentElement!.querySelectorAll('button')];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const key = familyA.find(
          (candidate) => name(candidate) === row.getAttribute('aria-label'),
        )!;
        expect(providerOfferingLabel(key)!.line).toBe(heading.textContent);
      }
    }
  });

  it('labels a dated snapshot by its model name, never by the raw provider id', () => {
    const offering = offerings[datedKey]!;
    renderSection(sources(source('ready', catalogue([model(datedKey)]))));

    const row = screen.getByRole('button', { name: name(datedKey) });
    expect(row).toHaveTextContent(providerOfferingLabel(datedKey)!.name);
    expect(row).not.toHaveTextContent(offering.providerModelId!);
    expect(screen.queryByText(offering.providerModelId!)).not.toBeInTheDocument();
  });

  it('keeps unavailable models in a collapsed group with a plain reason on each row', () => {
    const exhausted = familyB[0]!;
    const expired = familyB[1]!;
    const onSelect = renderSection(
      sources(
        source(
          'ready',
          catalogue([model(familyA[0]!), model(exhausted, 'exhausted'), model(expired, 'expired')]),
        ),
      ),
    );

    expect(screen.queryByRole('button', { name: name(exhausted) })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Unavailable/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    const spent = screen.getByRole('button', { name: name(exhausted) });
    expect(spent).toHaveAttribute('aria-disabled', 'true');
    expect(spent).not.toHaveAttribute('disabled');
    expect(spent).toHaveAccessibleDescription(/Free allowance used up$/);
    expect(screen.getByRole('button', { name: name(expired) })).toHaveAccessibleDescription(
      new RegExp(`Free offer ended ${literal(calendarDay('2026-08-22'))}$`),
    );

    fireEvent.click(spent);
    expect(onSelect).not.toHaveBeenCalled();
    expect(spent).toHaveAccessibleDescription(
      new RegExp(
        `${ISSUER}'s free allowance for .+ is used up\\..+Choose ${FALLBACK} or another free model\\.$`,
      ),
    );
  });

  it('writes allowance dates as calendar days, never as raw ISO dates', () => {
    const ready = familyA[0]!;
    const ended = familyB[0]!;
    renderSection(
      sources(
        source(
          'ready',
          catalogue([{ ...model(ready), expiresOn: '2026-10-21' }, model(ended, 'expired')]),
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Unavailable/ }));

    expect(screen.getByRole('button', { name: name(ready) })).toHaveAccessibleDescription(
      new RegExp(`expires ${literal(calendarDay('2026-10-21'))}$`),
    );
    const endedRow = screen.getByRole('button', { name: name(ended) });
    fireEvent.click(endedRow);
    expect(screen.getByRole('status')).toHaveTextContent(`ended on ${calendarDay('2026-08-22')}.`);
    expect(document.body).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
  });

  it('announces why through a live region that is on the page before the row is pressed', () => {
    const unavailable = familyB[0]!;
    renderSection(
      sources(source('ready', catalogue([model(familyA[0]!), model(unavailable, 'unavailable')]))),
    );
    fireEvent.click(screen.getByRole('button', { name: /Unavailable/ }));
    const row = screen.getByRole('button', { name: name(unavailable) });
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(row).toHaveAccessibleDescription(/Not available right now$/);

    fireEvent.click(row);

    const explanation = `${name(unavailable)} from ${ISSUER} is not available right now. Choose ${FALLBACK} or another free model.`;
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(explanation);
    expect(row).toHaveAccessibleDescription(
      new RegExp(`Not available right now ${literal(explanation)}$`),
    );
  });

  it('replaces a wall of unavailable rows with one explanation when the whole pool is paused', () => {
    renderSection(
      sources(source('ready', catalogue(chatKeys.map((key) => model(key, 'unavailable'))))),
    );

    expect(
      screen.getByText(
        `Free models are paused right now. Keep chatting with ${FALLBACK}, or check back later.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Free ',
      FALLBACK,
    ]);
  });

  it('names only the paused pool while another free source is still being checked', () => {
    renderSection(
      sources(
        source('ready', catalogue(chatKeys.map((key) => model(key, 'unavailable')))),
        source('loading'),
      ),
    );

    expect(screen.getByText(`${ISSUER} free models are paused right now.`)).toBeInTheDocument();
    expect(screen.queryByText(/^Free models are paused/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep chatting/)).not.toBeInTheDocument();
    expect(screen.getByText('Checking free models…')).toBeInTheDocument();
  });

  it('names only the paused pool and offers a retry when another free source failed', () => {
    const failed = source('error');
    renderSection(
      sources(source('ready', catalogue(chatKeys.map((key) => model(key, 'exhausted')))), failed),
    );

    expect(screen.getByText(`${ISSUER} free allowances are used up.`)).toBeInTheDocument();
    expect(screen.queryByText(/^Free model allowances are used up/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep chatting/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Experiential Labs free models' }));
    expect(failed.retry).toHaveBeenCalledTimes(1);
  });

  it('always shows the selected model with its reason, even when it is unavailable', () => {
    const selected = familyB[0]!;
    renderSection(sources(source('ready', catalogue([model(selected, 'unavailable')]))), {
      selectedId: selected,
    });

    const row = screen.getByRole('button', { name: name(selected) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription(/Not available right now$/);
  });

  it('keeps the selected free model in view, marked as being checked, until its catalogue loads', () => {
    const selected = familyA[0]!;
    renderSection(sources(source('loading'), source('loading')), { selectedId: selected });

    const row = screen.getByRole('button', { name: name(selected) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription(/Checking availability…$/);
    expect(screen.getByText('Checking free models…')).toBeInTheDocument();
  });

  it('keeps the selected free model in view with a retry when its catalogue could not load', () => {
    const selected = familyA[0]!;
    const failed = source('error');
    const onSelect = renderSection(sources(failed), { selectedId: selected });

    const row = screen.getByRole('button', { name: name(selected) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAccessibleDescription(/Availability could not be checked$/);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      `${name(selected)} could not be checked. Retry, or choose ${FALLBACK}.`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading free models' }));
    expect(failed.retry).toHaveBeenCalledTimes(1);
  });

  it('checks an Experiential Labs selection against its own source', () => {
    renderSection(sources(source('ready', catalogue([model(familyA[0]!)])), source('loading')), {
      selectedId: experientialKey,
    });

    expect(screen.getByRole('button', { name: name(experientialKey) })).toHaveAccessibleDescription(
      /Checking availability…$/,
    );
  });

  it('keeps the last free models, the selected one and a retry on screen when a refresh fails', () => {
    const selected = familyB[0]!;
    renderSection(sources(source('error', catalogue([model(familyA[0]!), model(selected)]))), {
      selectedId: selected,
    });

    const row = screen.getByRole('button', { name: name(selected) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: name(familyA[0]!) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading free models' })).toBeInTheDocument();
  });

  it('keeps a selected free model its catalogue no longer lists in view and says why', () => {
    const selected = familyB[0]!;
    const onSelect = renderSection(sources(source('ready', catalogue([model(familyA[0]!)]))), {
      selectedId: selected,
    });

    const row = screen.getByRole('button', { name: name(selected) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription(/Not available right now$/);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      `${name(selected)} is not available right now. Choose ${FALLBACK} or another free model.`,
    );
  });

  it('keeps a selected Experiential Labs model in view once its promotion is no longer offered', () => {
    renderSection(sources(source('ready', catalogue([model(familyA[0]!)])), source('hidden')), {
      selectedId: experientialKey,
    });

    const row = screen.getByRole('button', { name: name(experientialKey) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAccessibleDescription(/Not available right now$/);
  });

  it('renders the rest of the section while free models load', () => {
    renderSection(sources(source('loading'), source('loading')));

    expect(screen.getByRole('button', { name: FALLBACK })).toBeInTheDocument();
    expect(screen.getByText('Checking free models…')).toBeInTheDocument();
  });

  it('offers a retry when the free models fail to load', () => {
    const failed = source('error');
    renderSection(sources(failed));

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading free models' }));
    expect(failed.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: FALLBACK })).toBeInTheDocument();
  });

  it('links to data-use details without putting the long disclosure in the model picker', () => {
    renderSection(
      sources(
        source('hidden'),
        source('ready', catalogue([model(experientialKey)], 'Experiential Labs')),
      ),
    );

    expect(screen.getByRole('link', { name: 'Data use' })).toHaveAttribute('href', '/privacy');
    expect(screen.queryByText(/Experiential Labs captures prompts/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: name(experientialKey) })).toHaveAccessibleDescription(
      PROMOTION_DESCRIPTION,
    );
  });

  it('reads the data-use note on a selected Experiential Labs model pinned above the list', () => {
    const withLabs = () =>
      sources(
        source('ready', catalogue(familyA.map((key) => model(key)))),
        source(
          'ready',
          catalogue(
            experientialKeys.map((key) => model(key)),
            'Experiential Labs',
          ),
        ),
      );
    renderSection(withLabs());
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const tail = within(screen.getByRole('group', { name: 'More Experiential Labs free models' }))
      .getAllByRole('button')[0]!
      .getAttribute('aria-label')!;
    cleanup();

    renderSection(withLabs(), {
      selectedId: experientialKeys.find((key) => name(key) === tail)!,
    });

    const pinned = screen.getByRole('button', { name: tail });
    expect(pinned).toHaveAttribute('aria-pressed', 'true');
    expect(pinned).toHaveAccessibleDescription(PROMOTION_DESCRIPTION);
  });

  it('heads each pool in More models and repeats the data-use note over Experiential Labs models', () => {
    renderSection(
      sources(
        source('ready', catalogue(familyA.map((key) => model(key)))),
        source(
          'ready',
          catalogue(
            experientialKeys.map((key) => model(key)),
            'Experiential Labs',
          ),
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    const cloud = within(more).getByRole('group', { name: `More ${ISSUER} free models` });
    const labs = within(more).getByRole('group', { name: 'More Experiential Labs free models' });

    expect(within(cloud).getByText(ISSUER)).toBeInTheDocument();
    expect(within(cloud).queryByText(DATA_USE_NOTE)).not.toBeInTheDocument();
    expect(within(labs).getByText(DATA_USE_NOTE)).toBeInTheDocument();
    expect(within(labs).getByRole('link', { name: 'Data use' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    const labsRows = within(more)
      .getAllByRole('button')
      .filter((row) =>
        experientialKeys.some((key) => name(key) === row.getAttribute('aria-label')),
      );
    expect(labsRows.length).toBeGreaterThan(0);
    for (const row of labsRows) {
      expect(labs).toContainElement(row);
      expect(row).toHaveAccessibleDescription(PROMOTION_DESCRIPTION);
    }
  });

  it('keeps the data-use note over an Experiential Labs model found by search', () => {
    renderSection(
      sources(
        source('ready', catalogue(familyA.map((key) => model(key)))),
        source(
          'ready',
          catalogue(
            experientialKeys.map((key) => model(key)),
            'Experiential Labs',
          ),
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    const found = within(
      within(more).getByRole('group', { name: 'More Experiential Labs free models' }),
    )
      .getAllByRole('button')[0]!
      .getAttribute('aria-label')!;

    fireEvent.change(within(more).getByRole('searchbox', { name: 'Search free models' }), {
      target: { value: found },
    });

    const labs = within(more).getByRole('group', {
      name: 'Matching Experiential Labs free models',
    });
    expect(within(labs).getByRole('button', { name: found })).toHaveAccessibleDescription(
      PROMOTION_DESCRIPTION,
    );
    expect(within(labs).getByText(DATA_USE_NOTE)).toBeInTheDocument();
    expect(within(labs).getByRole('link', { name: 'Data use' })).toBeInTheDocument();
    expect(
      within(more).queryByRole('group', { name: `Matching ${ISSUER} free models` }),
    ).not.toBeInTheDocument();
  });

  it('searches every free model the section lists, not only those behind More models', () => {
    const ended = familyB[0]!;
    renderSection(
      sources(
        source('ready', catalogue([...familyA.map((key) => model(key)), model(ended, 'expired')])),
        source(
          'ready',
          catalogue(
            experientialKeys.map((key) => model(key)),
            'Experiential Labs',
          ),
        ),
      ),
    );
    const featured = within(screen.getByRole('group', { name: `${ISSUER} free models` }))
      .getAllByRole('button')[0]!
      .getAttribute('aria-label')!;
    const labsFeatured = within(
      screen.getByRole('group', { name: 'Experiential Labs free models' }),
    )
      .getAllByRole('button')[0]!
      .getAttribute('aria-label')!;
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    const search = within(more).getByRole('searchbox', { name: 'Search free models' });

    fireEvent.change(search, { target: { value: featured } });
    const cloud = within(more).getByRole('group', { name: `Matching ${ISSUER} free models` });
    expect(within(cloud).getByRole('button', { name: featured })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(within(more).queryByText('No free models match.')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: labsFeatured } });
    const labs = within(more).getByRole('group', {
      name: 'Matching Experiential Labs free models',
    });
    expect(within(labs).getByText(DATA_USE_NOTE)).toBeInTheDocument();
    expect(within(labs).getByRole('button', { name: labsFeatured })).toHaveAccessibleDescription(
      PROMOTION_DESCRIPTION,
    );

    fireEvent.change(search, { target: { value: name(ended) } });
    const endedRow = within(more).getByRole('button', { name: name(ended) });
    expect(endedRow).toHaveAttribute('aria-disabled', 'true');
    expect(endedRow).toHaveAccessibleDescription(
      new RegExp(`Free offer ended ${literal(calendarDay('2026-08-22'))}$`),
    );

    fireEvent.change(search, { target: { value: FALLBACK } });
    expect(within(more).getByRole('button', { name: FALLBACK })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'no such free model' } });
    expect(within(more).queryAllByRole('button')).toHaveLength(0);
    expect(within(more).getByText('No free models match.')).toBeInTheDocument();
  });

  it('finds the selected free model in search while it is pinned above the list', () => {
    const withTail = () => sources(source('ready', catalogue(familyA.map((key) => model(key)))));
    renderSection(withTail());
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const tail = within(screen.getByRole('group', { name: 'More free models' }))
      .getAllByRole('button')[0]!
      .getAttribute('aria-label')!;
    cleanup();

    renderSection(withTail(), { selectedId: familyA.find((key) => name(key) === tail)! });
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    fireEvent.change(within(more).getByRole('searchbox', { name: 'Search free models' }), {
      target: { value: tail },
    });

    expect(within(more).getByRole('button', { name: tail })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('finds a selected free model its catalogue no longer lists and explains it once', () => {
    const unlisted = familyB[0]!;
    renderSection(sources(source('ready', catalogue(familyA.map((key) => model(key))))), {
      selectedId: unlisted,
    });
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    fireEvent.change(within(more).getByRole('searchbox', { name: 'Search free models' }), {
      target: { value: name(unlisted) },
    });

    const found = within(more).getByRole('button', { name: name(unlisted) });
    expect(found).toHaveAttribute('aria-pressed', 'true');
    expect(found).toHaveAccessibleDescription(/Not available right now$/);
    fireEvent.click(found);

    const explanation = `${name(unlisted)} is not available right now. Choose ${FALLBACK} or another free model.`;
    expect(screen.getAllByText(explanation)).toHaveLength(1);
    expect(within(more).getByText(explanation)).toHaveAttribute('role', 'status');
  });

  it('names the category a search found nothing in when free models span several', () => {
    renderSection(
      sources(source('ready', catalogue([...familyA.map((key) => model(key)), model(imageKey)]))),
    );
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    const more = screen.getByRole('group', { name: 'More free models' });
    fireEvent.change(within(more).getByRole('searchbox', { name: 'Search free models' }), {
      target: { value: name(imageKey) },
    });

    expect(within(more).queryAllByRole('button')).toHaveLength(0);
    expect(within(more).getByText('No matches in Text chat.')).toBeInTheDocument();
  });

  it('gives a thumb a 44px target on every control between the model rows', () => {
    renderSection(
      sources(
        source('ready', catalogue([...familyA.map((key) => model(key)), model(imageKey)])),
        source(
          'ready',
          catalogue(
            experientialKeys.map((key) => model(key)),
            'Experiential Labs',
          ),
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));

    const [dataUse] = screen.getAllByRole('link', { name: 'Data use' });
    expect(dataUse).toHaveClass('min-h-6', 'pointer-coarse:min-h-11', 'pointer-coarse:w-full');
    expect(screen.getByRole('combobox', { name: 'Free model category' })).toHaveClass(
      'pointer-coarse:min-h-11',
    );
    expect(screen.getByRole('searchbox', { name: 'Search free models' })).toHaveClass(
      'pointer-coarse:min-h-11',
    );
  });

  it('offers media categories only when the account receives media offerings', () => {
    const { unmount } = render(
      <FreeQuotaModelSection
        sources={sources(source('ready', catalogue([model(familyA[0]!)])))}
        selectedId="auto"
        onSelect={vi.fn()}
        fallback={null}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Free model category' })).not.toBeInTheDocument();
    unmount();

    const onSelect = renderSection(sources(source('ready', catalogue([model(imageKey)]))));
    const image = screen.getByRole('button', { name: name(imageKey) });
    expect(image).toHaveAccessibleDescription(/Free quota · images/);
    fireEvent.click(image);
    expect(onSelect).toHaveBeenLastCalledWith(imageKey);
  });

  it('switches between chat and media offerings', () => {
    renderSection(sources(source('ready', catalogue([model(familyA[0]!), model(imageKey)]))));

    expect(screen.getByRole('button', { name: name(familyA[0]!) })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Free model category' }), {
      target: { value: 'image' },
    });
    expect(screen.getByRole('button', { name: name(imageKey) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: name(familyA[0]!) })).not.toBeInTheDocument();
  });

  it('opens on the category of a selected media model and shows it as chosen', () => {
    renderSection(sources(source('ready', catalogue([model(imageKey), model(videoKey)]))), {
      selectedId: videoKey,
    });

    expect(screen.getByRole('combobox', { name: 'Free model category' })).toHaveValue('video');
    expect(screen.getByRole('button', { name: name(videoKey) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('never points an account offered only media to the free chat model', () => {
    renderSection(
      sources(
        source(
          'ready',
          catalogue([model(imageKey, 'unavailable'), model(videoKey, 'unavailable')]),
        ),
      ),
    );
    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep chatting/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Free model category' })).not.toBeInTheDocument();
  });

  it('explains an unavailable media model without suggesting the chat model', () => {
    const [ready, unavailable] = imageKeys.filter(
      (key) => providerOfferingLabel(key)!.family === providerOfferingLabel(imageKey)!.family,
    );
    renderSection(
      sources(source('ready', catalogue([model(ready!), model(unavailable!, 'unavailable')]))),
    );
    fireEvent.click(screen.getByRole('button', { name: /Unavailable/ }));
    fireEvent.click(screen.getByRole('button', { name: name(unavailable!) }));

    expect(screen.getByRole('status')).toHaveTextContent(/Choose another free model\.$/);
    expect(screen.getByRole('status')).not.toHaveTextContent(FALLBACK);
  });

  it('draws a focus ring on every row the arrow keys reach', () => {
    const unavailable = familyB[0]!;
    renderSection(
      sources(
        source(
          'ready',
          catalogue([...familyA.map((key) => model(key)), model(unavailable, 'unavailable')]),
        ),
        source('error'),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /More models/ }));
    fireEvent.click(screen.getByRole('button', { name: /Unavailable/ }));
    const featured = within(screen.getByRole('group', { name: `${ISSUER} free models` }));
    const rows = [
      screen.getByRole('button', { name: 'Free' }),
      featured.getAllByRole('button')[0]!,
      within(screen.getByRole('group', { name: 'More free models' })).getAllByRole('button')[0]!,
      screen.getByRole('button', { name: name(unavailable) }),
      screen.getByRole('button', { name: /More models/ }),
      screen.getByRole('button', { name: /Unavailable/ }),
      screen.getByRole('button', { name: 'Retry Experiential Labs free models' }),
    ];

    for (const row of rows) {
      expect(row).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-[var(--chat-focus-ring)]',
      );
    }
  });

  it('renders nothing for an account offered no free models', () => {
    const { container } = render(
      <FreeQuotaModelSection
        sources={sources(source('hidden'))}
        selectedId="auto"
        onSelect={vi.fn()}
        fallback={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
