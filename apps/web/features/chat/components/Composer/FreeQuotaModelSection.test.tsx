import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { freeModelFamilyName, freeModelLabel } from '@/features/models/lib/free-model-label';
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
  const family = freeModelLabel(key)!.family;
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
const experientialKey = chatKeys.find((key) => offerings[key]!.provider === 'experientiallabs')!;
const imageKey = Object.entries(offerings).find(
  ([, offering]) => offering.category === 'image' && offering.quotaProbeProtocol === 'image-sync',
)![0];

function name(key: string): string {
  return freeModelLabel(key)!.displayName;
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
      fallbackModelName={FALLBACK}
    >
      <button type="button" data-picker-row="">
        {FALLBACK}
      </button>
    </FreeQuotaModelSection>,
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
    for (const family of [familyA, familyB]) {
      expect(
        within(expanded).getByText(freeModelFamilyName(freeModelLabel(family[0]!)!.family)),
      ).toBeInTheDocument();
    }

    const [first] = within(expanded).getAllByRole('button');
    fireEvent.click(first!);
    expect(onSelect).toHaveBeenCalledWith(
      models.find((entry) => name(entry.key) === first!.getAttribute('aria-label'))!.key,
    );
  });

  it('labels a dated snapshot by its model name, never by the raw provider id', () => {
    const offering = offerings[datedKey]!;
    renderSection(sources(source('ready', catalogue([model(datedKey)]))));

    const row = screen.getByRole('button', { name: name(datedKey) });
    expect(row).toHaveTextContent(freeModelLabel(datedKey)!.name);
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
      /Free offer ended 2026-08-22$/,
    );

    fireEvent.click(spent);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      `${ISSUER}'s free allowance for ${name(exhausted)} is used up.`,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Choose ${FALLBACK} or another free model.`,
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
      'Free promotion · text chat · provider quota applies',
    );
  });

  it('offers media categories only when the account receives media offerings', () => {
    const { unmount } = render(
      <FreeQuotaModelSection
        sources={sources(source('ready', catalogue([model(familyA[0]!)])))}
        selectedId="auto"
        onSelect={vi.fn()}
        fallbackModelName={null}
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

  it('renders nothing for an account offered no free models', () => {
    const { container } = render(
      <FreeQuotaModelSection
        sources={sources(source('hidden'))}
        selectedId="auto"
        onSelect={vi.fn()}
        fallbackModelName={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
