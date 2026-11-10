import Link from 'next/link';
import {
  BILLING_PLAN_PRICING,
  PRODUCT_NAMES,
  billingPlanCapabilityPlanLabels,
} from '@agiworkforce/types';
import { formatCurrency } from '@agiworkforce/utils';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Breadcrumb, Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';
import { PAID_UPGRADE_ACCESS_NOTE } from '@/lib/billing/paid-upgrade-copy';
import { SUBSCRIPTION_GUIDE } from '@/lib/blog-posts';
import { MANAGED_CLOUD_STATUS, LEGAL_ENTITY } from '@/lib/legal-constants';
import { buildMetadata } from '@/lib/seo/metadata';
import { surfaceAvailabilitySummary } from '@/lib/surface-status';
import '@/features/marketing/components/pages/company/company.css';

const { basic, pro } = BILLING_PLAN_PRICING;
const usd = (amount: number) => formatCurrency(amount, 'USD', 'en-US');
const hypotheticalSubscriptions = 3;
const hypotheticalOldBill = hypotheticalSubscriptions * pro.monthlyPriceUsd;
const hypotheticalMonthlyDifference = hypotheticalOldBill - pro.monthlyPriceUsd;
const updatedLabel = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
  timeZone: 'UTC',
}).format(new Date(SUBSCRIPTION_GUIDE.updated));

export const metadata = buildMetadata({
  ...SUBSCRIPTION_GUIDE,
  ogType: 'article',
});

export default function SubscriptionGuidePage() {
  return (
    <div data-design="agi" data-public-reference="article" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <article aria-labelledby="subscription-guide-title">
          <Section>
            <Stack>
              <Breadcrumb
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Blog', href: '/blog' },
                  { label: SUBSCRIPTION_GUIDE.title },
                ]}
              />
              <Eyebrow>Buying guide</Eyebrow>
              <h1 className="agi-ds-h1" id="subscription-guide-title">
                {SUBSCRIPTION_GUIDE.title}
              </h1>
              <Prose>{SUBSCRIPTION_GUIDE.summary}</Prose>
              <Prose size="sm">
                Published by the team behind this workspace, operated by {LEGAL_ENTITY}. Facts
                checked <time dateTime={SUBSCRIPTION_GUIDE.updated}>{updatedLabel}</time>. This
                comparison describes documented workflows, without a hands-on quality benchmark.
              </Prose>

              <h2 className="agi-ds-h2">
                Model access and an app subscription buy different things
              </h2>
              <Prose>
                An AI model generates an answer. The application around it supplies project
                organization, memory, search tools, file handling, permissions and billing rules.
                Two applications using a model from the same provider can behave differently.
              </Prose>
              <Prose>
                Access to an Anthropic model inside another workspace does not purchase a
                subscription to the official Claude app. The same distinction applies to GPT models
                and ChatGPT, or Gemini models and Google’s subscription benefits.
              </Prose>
              <Prose>
                There are exceptions to check. OpenAI documents optional ChatGPT plan usage in
                participating third-party apps through an explicit sign-in and authorization flow.
                Eligibility matters, and the connection does not by itself share your memories or
                conversations. Do not assume your existing ChatGPT allowance works in any particular
                app. Read{' '}
                <a href="https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites">
                  OpenAI’s current guidance
                </a>
                .
              </Prose>

              <h2 className="agi-ds-h2">Compare what you pay for</h2>
              <div className="agi-ds-legal-table">
                <table>
                  <caption className="sr-only">
                    AI purchasing approaches, costs and practical fit
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Approach</th>
                      <th scope="col">What you pay for</th>
                      <th scope="col">When it fits</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Separate official apps</th>
                      <td>Each provider’s own plan and application.</td>
                      <td>
                        A specific native feature or connected ecosystem is central to your work.
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Multi-model workspace</th>
                      <td>One application’s allowance across eligible provider models.</td>
                      <td>You want several model families without managing API keys.</td>
                    </tr>
                    <tr>
                      <th scope="row">BYOK interface</th>
                      <td>The interface, plus provider-billed usage and any storage fees.</td>
                      <td>You want direct provider billing and can manage keys and usage.</td>
                    </tr>
                    <tr>
                      <th scope="row">Local model setup</th>
                      <td>Hardware, model downloads and any software fees.</td>
                      <td>
                        You need on-device inference or offline work and have suitable hardware.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Prose>
                Poe documents a shared points pool, official provider bots and user-created bots. It
                is relevant when exploring that bot ecosystem is the main job. Check each bot’s
                cost, including how conversation history affects it.{' '}
                <a href="https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs">
                  Poe’s official FAQ
                </a>{' '}
                explains the rules.
              </Prose>
              <Prose>
                TypingMind sells an interface license. Its pricing page excludes API usage and
                additional cloud storage from the license price. It is relevant when you want to
                supply provider keys and manage those costs separately. Check{' '}
                <a href="https://www.typingmind.com/buy">TypingMind pricing</a>.
              </Prose>
              <Prose>
                A smaller monthly headline price alone does not establish which approach is cheaper
                for your workload.
              </Prose>

              <h2 className="agi-ds-h2">Where {PRODUCT_NAMES.chat} fits today</h2>
              <Prose>
                {PRODUCT_NAMES.chat} is a browser workspace using Cloud ({MANAGED_CLOUD_STATUS}).
                Its public pages document projects, editable memory, artifacts and web search, with
                model and feature access controlled by your plan and available routes. Deep Research
                asks you to review a plan before gathering sources. See the{' '}
                <Link href="/web">web product</Link> and{' '}
                <Link href="/features/deep-research">research workflow</Link>.
              </Prose>
              <Prose>
                Current USD monthly prices include {basic.label} at {usd(basic.monthlyPriceUsd)} and{' '}
                {pro.label} at {usd(pro.monthlyPriceUsd)}. Deep Research is included on{' '}
                {billingPlanCapabilityPlanLabels('deep_research')} plans, subject to account and
                workspace access. Prices exclude applicable tax.{' '}
                <Link href="/pricing">Compare current plans</Link>.
              </Prose>
              <Prose>{PAID_UPGRADE_ACCESS_NOTE}</Prose>
              <Prose>
                The provider catalog is not the list of models included in every Cloud plan. It
                counts routes, which can include the same underlying model more than once. Use the
                pricing table and your account’s model picker to check eligibility.{' '}
                <Link href="/providers">How the catalog is counted</Link> explains the difference.
              </Prose>
              <Prose>
                {surfaceAvailabilitySummary()} The web app uses Cloud; Local and BYOK belong to the
                developer surfaces. If you need an installer, provider keys or offline inference,
                check <Link href="/download">current application availability</Link>,{' '}
                <Link href="/byok">BYOK scope</Link> and <Link href="/local">Local scope</Link>{' '}
                before choosing.
              </Prose>

              <h2 className="agi-ds-h2">
                Calculate savings using the plans you would actually keep
              </h2>
              <Prose>
                <strong>
                  Monthly difference = recurring plans you can cancel − replacement subscription −
                  additional usage and storage costs.
                </strong>
              </Prose>
              <Prose>
                Suppose your own invoices show {hypotheticalSubscriptions} subscriptions costing{' '}
                {usd(pro.monthlyPriceUsd)} each, and you can replace all of them with one
                subscription costing {usd(pro.monthlyPriceUsd)}. The hypothetical difference is{' '}
                {usd(hypotheticalOldBill)} − {usd(pro.monthlyPriceUsd)} ={' '}
                {usd(hypotheticalMonthlyDifference)} a month, or{' '}
                {usd(hypotheticalMonthlyDifference * 12)} over twelve months. These are assumed
                inputs, not current competitor prices, equal allowances or guaranteed savings.
              </Prose>
              <Prose>
                If you replace only one plan with another at the same price, the subscription saving
                is zero. Add back the cost of any original plan you retain. Include tax consistently
                on both sides.
              </Prose>
              <Prose>
                For BYOK, record input and output tokens for your own tasks, apply the provider’s
                current rates, then add interface, search and storage charges. Do not turn a guessed
                number of messages into a cost estimate: a short question and a long document review
                can consume very different amounts.
              </Prose>

              <h2 className="agi-ds-h2">Run a small test before switching</h2>
              <Prose>
                Choose recurring tasks whose results you can check. Use material you are allowed to
                send to the selected service. The following is a method you can reproduce, not a
                report of tests we have already run on these products.
              </Prose>
              <ol className="list-decimal ps-[var(--space-5)]">
                <li>
                  <Prose>
                    <strong>Document task:</strong> ask for a summary with specified facts. Keep a
                    source copy so you can identify omissions and invented details.
                  </Prose>
                </li>
                <li>
                  <Prose>
                    <strong>Writing task:</strong> supply a brief and explicit constraints. Check
                    accuracy, tone and how much editing you need.
                  </Prose>
                </li>
                <li>
                  <Prose>
                    <strong>Current-information task:</strong> ask a dated question with
                    primary-source citations. Open every link and check that it supports the
                    associated claim.
                  </Prose>
                </li>
              </ol>
              <Prose>
                Run each task twice in new conversations. Keep prompts, files and enabled tools the
                same. Record whether you use memory or project instructions so earlier context does
                not enter the test unnoticed.
              </Prose>
              <div className="agi-ds-legal-table">
                <table>
                  <caption className="sr-only">
                    What to record during an AI workspace evaluation
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Record</th>
                      <th scope="col">Why it matters</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Date, app, plan, model label and tools</th>
                      <td>The conditions make the result reproducible.</td>
                    </tr>
                    <tr>
                      <th scope="row">Correct facts and missed instructions</th>
                      <td>Fluency does not establish task completion.</td>
                    </tr>
                    <tr>
                      <th scope="row">Support from each cited page</th>
                      <td>A link can exist without supporting a claim.</td>
                    </tr>
                    <tr>
                      <th scope="row">Usage and any limit reached</th>
                      <td>The allowance matters alongside the monthly price.</td>
                    </tr>
                    <tr>
                      <th scope="row">Checking and editing time</th>
                      <td>Your total cost includes your own work.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Prose>
                Agreement between models is not proof that an answer is correct. They can repeat the
                same mistaken premise or weak source. Check the underlying evidence, especially when
                a decision has consequences.
              </Prose>

              <h2 className="agi-ds-h2">When keeping an official app makes sense</h2>
              <Prose>
                Keep an official app when a feature in it is part of your daily workflow and a
                replacement does not reproduce it. This could be a particular connected application,
                research workflow or native experience. Verify the actual feature and account
                requirements rather than inferring them from a provider’s logo.
              </Prose>
              <Prose>
                A mixed setup can also work: keep the app you use heavily and use another workspace
                for occasional access to other models. Remove spending or friction you can identify.
              </Prose>

              <h2 className="agi-ds-h2">Questions to settle before paying</h2>
              <h3 className="agi-ds-h3">Does a plan include official provider subscriptions?</h3>
              <Prose>
                No. It buys this service and eligible model access under its own allowances. It does
                not purchase ChatGPT, Claude or Google AI app subscriptions, or transfer their chat
                histories and memories.
              </Prose>
              <h3 className="agi-ds-h3">Are all catalog models included in every plan?</h3>
              <Prose>
                No. The catalog, provider routes and Cloud plan roster answer different questions.
                Check <Link href="/pricing">the pricing table</Link> and your account’s model
                picker.
              </Prose>
              <h3 className="agi-ds-h3">Is Cloud usage unlimited?</h3>
              <Prose>
                No. Usage is metered over rolling windows without a fixed message promise. Credits,
                top-ups and account settings affect what happens after an allowance runs out. Read{' '}
                <Link href="/help/usage-and-credits">usage limits and credits</Link>.
              </Prose>
              <h3 className="agi-ds-h3">What should I try first?</h3>
              <Prose>
                If you want a cloud workspace for models, projects, memory and artifacts,{' '}
                <Link href={WEB_ENTRY_HREF}>try {PRODUCT_NAMES.chat}</Link> with a task whose answer
                you can verify. Check <Link href="/pricing">current plans</Link> if you need
                research or higher usage. Keep an existing subscription until a replacement passes
                the tasks that matter to you.
              </Prose>
            </Stack>
          </Section>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
