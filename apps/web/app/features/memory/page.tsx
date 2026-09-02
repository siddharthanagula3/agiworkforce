import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Memory: the list of facts you can read and edit',
  description:
    'AGI keeps memory as short sentences in a list you can open, search, rewrite, and clear. See what a chat can add, what reaches the model, and where the list is stored.',
  path: '/features/memory',
});

export default function MemoryFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-memory-title"
          eyebrow="Features · Memory"
          title="Read every fact AGI keeps about you."
          lede="Memory is a list of short sentences that lives in Settings. What the assistant remembers about you is written there in plain language, and you can search it, rewrite any line, or clear the whole list."
          ctas={[{ href: '/settings/memory', label: 'Open your memory list' }]}
          visual={
            <ProductFrame
              light="/product/memory-settings-light.png"
              dark="/product/memory-settings-dark.png"
              alt="The memory settings panel in AGI, listing where memories come from and how to suppress a source"
              width={1720}
              height={1360}
              caption={['Settings', 'Memory']}
              priority
            />
          }
        />

        <Section id="the-pane" labelledBy="agi-features-memory-pane-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The pane</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-memory-pane-title">
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
                  value:
                    'Click a fact to rewrite it in place. Saving an empty box deletes that fact instead.',
                },
                {
                  label: 'Delete',
                  value:
                    'Every row carries its own delete control, and the row goes the moment you use it.',
                },
                {
                  label: 'Search',
                  value:
                    'Once the list holds anything, a search box appears above it and filters the rows by the text they contain.',
                },
                {
                  label: 'Forget everything',
                  value:
                    'One control empties the list, behind a confirmation that names how many facts are about to go.',
                },
                {
                  label: 'Exclusions',
                  value:
                    'Terms you never want captured, plus the sources you never want recalled from: automatic capture, the web app, Desktop, or mobile.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="origins" labelledBy="agi-features-memory-origins-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Origins</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-memory-origins-title">
                Where a fact comes from.
              </h2>
              <Prose>
                Nothing lands on the list by accident, and a captured fact still arrives as an
                ordinary row you can rewrite or throw away.
              </Prose>
            </div>
            <Ledger
              caption="Where a memory comes from"
              rows={[
                {
                  label: '01',
                  value:
                    'You write it. Type the fact into the box above the list. It is stored exactly as you wrote it, under your own name for it.',
                },
                {
                  label: '02',
                  value:
                    'A finished chat produces it. With Memory and Generate from past chats both on, the turn is scanned for first-person statements, "I prefer…", "my name is…", "remember that…", and each match is rewritten in the third person before it is offered to the list.',
                },
                {
                  label: '03',
                  value:
                    'You import it. On mobile, a ChatGPT, Claude, or Gemini export file is parsed on the device, and the remembered facts inside it join the list as ordinary rows.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="recall" labelledBy="agi-features-memory-recall-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Recall</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-memory-recall-title">
                What the model actually receives.
              </h2>
              <Prose>
                Only part of the list travels with a request, and it travels as data the model may
                read but never obey. Recalled facts are wrapped in a block marked as untrusted,
                under a standing rule that instructions found inside a memory are never followed. A
                fact is a preference, and where one disagrees with the request in front of it, the
                request wins.
              </Prose>
            </div>
            <Ledger
              caption="Memory recall bounds"
              rows={[
                {
                  label: 'Stored',
                  value:
                    'On the device that created it, and synced to your account across the devices you sign into.',
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

        <Section id="memory-close" labelledBy="agi-features-memory-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-memory-close-title">
              Open the list and read it.
            </h2>
            <Prose>
              The memory pane sits in Settings, next to the exclusions that govern what may be
              written to it. Everything on the list is a sentence you can rewrite or remove.
            </Prose>
            <ButtonRow>
              <Button href="/download">See where AGI runs</Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
