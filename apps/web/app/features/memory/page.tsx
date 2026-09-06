import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MemoryWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';

export const metadata = buildMetadata({
  title: 'Memory: the list of facts you can read and edit',
  description:
    'AGI keeps memory as short sentences in a list you can open, search, rewrite, and clear. See what a chat can add, what reaches the model, and where the list is stored.',
  path: '/features/memory',
});

const IDS = {
  hero: 'agi-features-memory-title',
  pane: 'agi-features-memory-pane-title',
  origins: 'agi-features-memory-origins-title',
  recall: 'agi-features-memory-recall-title',
  close: 'agi-features-memory-close-title',
} as const;

const ORIGINS = [
  {
    meta: 'You write it',
    title: 'Typed into the box',
    body: 'Stored exactly as you wrote it, above the list, under your own name for it.',
  },
  {
    meta: 'A chat produces it',
    title: 'Scanned from a finished turn',
    body: 'With Memory and Generate from past chats both on, first-person statements are rewritten in the third person before being offered to the list.',
  },
  {
    meta: 'You import it',
    title: 'Parsed from an export file',
    body: 'On mobile, a ChatGPT, Claude, or Gemini export is parsed on the device, and the facts inside it join the list as ordinary rows.',
  },
] as const;

export default function MemoryFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Memory</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Every fact AGI keeps</span>
                <em className="agi-lp-accent">is a sentence you can read.</em>
              </h1>
              <p className="agi-lp-lede">
                Memory is a list of short sentences that lives in Settings. What the assistant
                remembers about you is written there in plain language, and you can search it,
                rewrite any line, or clear the whole list.
              </p>
              <ButtonRow>
                <Button href="/settings/memory">Open your memory list</Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <MemoryWindow />
            </div>
          </div>
        </section>

        <Section id="the-pane" labelledBy={IDS.pane} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The pane</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.pane}>
                What the memory pane lets you change.
              </h2>
              <Prose>
                The pane is the whole feature. A box to add a fact sits above the list, every stored
                fact gets its own row, and each control below acts on that list directly.
              </Prose>
            </div>
            <Ledger
              caption="Memory pane controls"
              rows={[
                {
                  label: 'Add',
                  value:
                    'A box above the list takes up to 280 characters. Press Add and the fact appears in the list straight away.',
                },
                {
                  label: 'Edit',
                  value: 'Click a fact to rewrite it in place. Saving an empty box deletes it.',
                },
                {
                  label: 'Delete',
                  value:
                    'Every row carries its own delete control, and it goes the moment you use it.',
                },
                {
                  label: 'Search',
                  value: 'Once the list holds anything, a search box filters the rows by text.',
                },
                {
                  label: 'Forget everything',
                  value:
                    'One control empties the list, behind a confirmation naming how many facts go.',
                },
                {
                  label: 'Exclusions',
                  value:
                    'Terms you never want captured, plus sources you never want recalled from: automatic capture, web, Desktop, or mobile.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="origins" labelledBy={IDS.origins} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Origins</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.origins}>
                Where a fact comes from.
              </h2>
              <Prose>
                Nothing lands on the list by accident, and a captured fact still arrives as an
                ordinary row you can rewrite or throw away.
              </Prose>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {ORIGINS.map((item) => (
                <div
                  key={item.meta}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground)] p-6"
                >
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="recall" labelledBy={IDS.recall} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Recall</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.recall}>
                What the model actually receives.
              </h2>
              <Prose>
                Only part of the list travels with a request, and it travels as data the model may
                read but never obey. Recalled facts are wrapped in a block marked as untrusted,
                under a standing rule that instructions found inside a memory are never followed.
              </Prose>
            </div>
            <Ledger
              caption="Memory recall bounds"
              rows={[
                {
                  label: 'Stored',
                  value: 'On the device that created it, synced across the devices you sign into.',
                },
                {
                  label: 'Recalled',
                  value:
                    'Up to 30 facts on AGI managed cloud and 50 on mobile, capped at 8,000 characters either way.',
                },
                { label: 'Per turn', value: 'A single chat turn can add at most five new facts.' },
                { label: 'Temporary chats', value: 'A temporary chat never writes to the list.' },
                {
                  label: 'Projects',
                  value:
                    'A fact can be confined to one project, and a confined fact never appears outside it.',
                },
              ]}
            />
            <ButtonRow>
              <Button href="/features/projects" variant="secondary">
                How project scoping works
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Open the list <em className="agi-lp-accent">and read it.</em>
              </h2>
              <p className="agi-lp-lede">
                The memory pane sits in Settings, next to the exclusions that govern what may be
                written to it. Everything on the list is a sentence you can rewrite or remove.
              </p>
              <ButtonRow>
                <Button href="/settings/memory">Open your memory list</Button>
                <Button href="/download" variant="secondary">
                  See where AGI runs
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
