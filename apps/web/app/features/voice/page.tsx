import { buildMetadata } from '@/lib/seo/metadata';
import {
  billingPlanCapabilityWireTiers,
  getBillingPlanPricing,
  getTierPolicy,
  isFreeBillingPlanTier,
  TOOL_APPROVAL_ACTION_LABELS,
} from '@agiworkforce/types';
import { LIVE_VOICES } from '@agiworkforce/types/live-voices';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { VoiceScenePreview } from '@/features/marketing/components/scenes/VoiceScene';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';

const VOICE_TIERS = billingPlanCapabilityWireTiers('managed_chat').filter(
  (plan) => getTierPolicy(plan).allowVoice,
);
const VOICE_PLANS = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
  VOICE_TIERS.map((plan) => getBillingPlanPricing(plan).label),
);
const FREE_TIER = VOICE_TIERS.find(isFreeBillingPlanTier);
const FREE_PLAN = FREE_TIER ? getBillingPlanPricing(FREE_TIER).label : null;
const FREE_VOICE_MINUTES = FREE_TIER ? (getTierPolicy(FREE_TIER).voiceMinutesPerMonth ?? 0) : 0;

export const metadata = buildMetadata({
  title: 'Voice: spoken conversation and dictation',
  description:
    'Start a voice session from the chat composer or dictate a message into it. Spoken turns are added to the chat, and voice settings choose the voice, language and pace.',
  path: '/features/voice',
});

const IDS = {
  hero: 'agi-features-voice-title',
  dictation: 'agi-features-voice-dictation-title',
  session: 'agi-features-voice-session-title',
  settings: 'agi-features-voice-settings-title',
  close: 'agi-features-voice-close-title',
} as const;

export default function VoiceFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Voice</p>
              <h1 className="sr-only" id={IDS.hero}>
                Voice
              </h1>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Open chat</Button>
                <Button href="/pricing#pricing-compare-title" variant="secondary">
                  See plans
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <VoiceScenePreview view="session" />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.dictation}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">Dictation</p>
              <h2 className="agi-lp-h2" id={IDS.dictation}>
                Dictate a message into the composer.
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">Record, then edit or send</h3>
                  <Prose>
                    The microphone button in the composer starts a recording and shows its waveform.
                    Stop transcribes the recording into the composer so you can edit it. Send
                    transcribes and sends it in one step. The close button or Escape discards the
                    recording. Dictation and its language are set in Settings, Voice.
                  </Prose>
                </div>
                <VoiceScenePreview view="dictation" />
              </article>
            </div>
          </div>
        </section>

        <Section id="voice-mode" labelledBy={IDS.session} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Voice mode</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.session}>
                A spoken conversation that stays in the chat.
              </h2>
              <Prose>
                Voice mode replaces the composer with a voice bar until you end the session.
              </Prose>
            </div>
            <Ledger
              caption="Controls in a voice session"
              rows={[
                {
                  label: 'Start',
                  value:
                    'When the composer is empty, the round button at its end starts voice mode.',
                },
                {
                  label: 'Speak',
                  value:
                    'Speak and the assistant answers aloud. Each spoken turn is added to the chat.',
                },
                {
                  label: 'Type',
                  value:
                    'Type in the voice bar to send a normal text turn without leaving the session.',
                },
                {
                  label: 'Mute',
                  value:
                    'The microphone button, or Space in the empty Type field, mutes and unmutes you.',
                },
                {
                  label: 'Captions',
                  value: 'Captions, in the plus button’s menu, shows each side’s words on screen.',
                },
                {
                  label: 'Pause',
                  value:
                    'Pause call in that menu closes the call, so nothing is used until you resume.',
                },
                {
                  label: 'Approve',
                  value: `An action that needs your approval waits on screen with ${TOOL_APPROVAL_ACTION_LABELS.approve} and ${TOOL_APPROVAL_ACTION_LABELS.deny}.`,
                },
                {
                  label: 'End',
                  value:
                    'The end button or Escape ends the voice session and brings the composer back.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="voice-settings" labelledBy={IDS.settings} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Voice settings</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.settings}>
                Voice settings sit in the chat header.
              </h2>
            </div>
            <div>
              <Prose>The gear in the chat header opens voice settings during a session.</Prose>
              <Prose>
                Pick one of {LIVE_VOICES.length} voices, a speaking pace, and a language or{' '}
                <span className="whitespace-nowrap">Auto-detect</span>.
              </Prose>
              <Prose>
                Under Voice reasoning, Thinking is for paid plans, from your next voice session.
              </Prose>
            </div>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Voice on your plan.
              </h2>
              <p className="agi-lp-lede">
                Voice is included on {VOICE_PLANS} plans.{' '}
                {FREE_PLAN && FREE_VOICE_MINUTES > 0
                  ? `On the ${FREE_PLAN} plan, voice mode and dictation share ${FREE_VOICE_MINUTES} minutes each calendar month. `
                  : null}
                Paid plans charge voice to the plan’s usage budget. Availability also depends on
                account access.
              </p>
              <ButtonRow>
                <Button href="/pricing#pricing-compare-title">See plans</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
