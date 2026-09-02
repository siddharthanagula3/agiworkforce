import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LEGAL_ENTITY, NOTICE_ADDRESS } from '@/lib/legal-constants';
import { providerLabels } from '@agiworkforce/types';
import modelRegistry from '@agiworkforce/types/models.json';

export const metadata = buildMetadata({
  title: 'Model licences',
  description:
    'Licence terms for every model this product can route to, generated from the canonical model registry: which are proprietary, which ship open weights, and what that means for your output.',
  path: '/model-licenses',
});

interface RegistryModel {
  id: string;
  name?: string;
  provider?: string;
  license?: string | null;
  openWeight?: boolean | null;
  modelType?: string;
}

function licenceLabel(model: RegistryModel): string {
  if (typeof model.license === 'string' && model.license.trim().length > 0) {
    return model.license === 'proprietary' ? 'Proprietary (provider terms)' : model.license;
  }
  return 'Not recorded in the registry';
}

function weightsLabel(model: RegistryModel): string {
  if (model.openWeight === true) return 'Open weights';
  if (model.openWeight === false) return 'Closed weights';
  return 'Not recorded';
}

const MODELS: RegistryModel[] = Object.values(
  (modelRegistry as { models: Record<string, RegistryModel> }).models,
);

const BY_PROVIDER = MODELS.reduce<Record<string, RegistryModel[]>>((acc, model) => {
  const key = model.provider ?? 'unknown';
  (acc[key] ??= []).push(model);
  return acc;
}, {});

const PROVIDER_KEYS = Object.keys(BY_PROVIDER).sort((a, b) =>
  (providerLabels[a] ?? a).localeCompare(providerLabels[b] ?? b),
);

const COLUMNS: readonly LedgerRow[] = [
  {
    label: 'Proprietary',
    value: (
      <>
        The provider licenses the model to us and to you under their own terms. Those terms travel
        with the output. The providers themselves are listed on{' '}
        <Link href="/subprocessors" className="agi-ds-link">
          /subprocessors
        </Link>
        .
      </>
    ),
  },
  {
    label: 'Open weights',
    value:
      "The model's weights are published under a named licence (for example MIT). That licence governs the weights. It does not by itself grant rights in anything the model reproduces.",
  },
  {
    label: 'Not recorded',
    value:
      "Our registry does not carry a licence for this entry yet. Treat it as unknown and check the provider's own terms before relying on the output commercially. We would rather say this than guess.",
  },
];

function providerRows(providerKey: string): LedgerRow[] {
  return BY_PROVIDER[providerKey]!.sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id),
  ).map((model) => ({
    label: model.name ?? model.id,
    value: `${licenceLabel(model)} · ${weightsLabel(model)}`,
  }));
}

export default function ModelLicensesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-model-licenses-title"
          eyebrow="Legal"
          title="Model licences."
          lede={
            <>
              This product routes to models from several vendors, some proprietary and some shipping
              open weights.{' '}
              <strong>
                The licence attached to the model that produced your output governs what you may do
                with it, and that is not the same for every model in the picker.
              </strong>{' '}
              This table is generated from the same model registry the router reads, so it cannot
              drift from what actually runs. Last updated: {modelRegistry.lastUpdated}.
            </>
          }
          ctas={[]}
        />

        <Section id="columns" labelledBy="agi-model-licenses-columns-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-model-licenses-columns-title">
              What the columns mean.
            </h2>
            <Ledger caption="Column definitions" rows={COLUMNS} />
          </Stack>
        </Section>

        {PROVIDER_KEYS.map((providerKey, index) => (
          <Section
            id={`provider-${providerKey}`}
            labelledBy={`agi-model-licenses-${providerKey}-title`}
            rule
            ground={index % 2 === 0 ? '2' : undefined}
            key={providerKey}
          >
            <Stack gap="loose">
              <h2 className="agi-ds-h2" id={`agi-model-licenses-${providerKey}-title`}>
                {providerLabels[providerKey] ?? providerKey}
              </h2>
              <Ledger
                caption={providerLabels[providerKey] ?? providerKey}
                rows={providerRows(providerKey)}
              />
            </Stack>
          </Section>
        ))}

        <Section id="your-output" labelledBy="agi-model-licenses-output-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-model-licenses-output-title">
              Your output.
            </h2>
            <Prose>
              We do not claim ownership of what you generate. What you may do with it depends on the
              licence above, the provider&rsquo;s terms, and the law where you are: a model licence
              cannot grant you rights in material the model reproduces from its training data. If
              you believe a generation reproduces work you own, the notice route is on{' '}
              <Link href="/copyright" className="agi-ds-link">
                /copyright
              </Link>
              .
            </Prose>
            <Prose>
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Model availability changes; this page regenerates
              from the registry, and material policy changes are recorded on{' '}
              <Link href="/changelog" className="agi-ds-link">
                /changelog
              </Link>
              .
            </Prose>
            <ButtonRow>
              <Button href="/copyright" variant="secondary">
                Copyright
              </Button>
              <Button href="/subprocessors" variant="secondary">
                Subprocessors
              </Button>
              <Button href="/terms" variant="secondary">
                Terms
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
