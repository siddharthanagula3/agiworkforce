import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * A question aimed at the back of a long project file must be answered from it.
 *
 * `scoreKnowledgeFile` ranked a file on its whole extracted text while
 * selection sent `content.slice(0, limit)`, so the passage that earned the file
 * its place was routinely not the passage the model saw. Every unit on the path
 * passed: ranking was right, truncation was right, and the two disagreed.
 *
 * `project-knowledge-passages.test.ts` drives the real `loadProjectContext`
 * with the answer at the beginning, the middle and the end of an oversized
 * document, which is the tighter test. This one exists because that whole path
 * is only reachable through a project's own composer, and the composer is where
 * the fix has never been seen working. The uploaded file is several times
 * `MAX_FILE_CONTENT_CHARS` and carries its canary at roughly nine tenths of the
 * way through, so a head-only selection cannot produce it.
 */
const PROJECTS_ROUTE = '/chat/projects';
const COMPOSER_LABEL = /message input/i;
const SOURCES_FILE_INPUT = '[data-testid="sources-file-input"]';
const SOURCES_TAB = 'Sources';
const AGENT_ACTIVITY_LABEL = /Show agent activity/i;
const REJECT_LABEL = 'Reject';
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const STOP_BUTTON_LABEL = /stop the current response/i;

const LOAD_TIMEOUT_MS = 30_000;
const EXTRACTION_TIMEOUT_MS = 90_000;
const ANSWER_TIMEOUT_MS = 180_000;
const APPROVAL_SETTLE_MS = 12_000;
const MAX_TOOL_REJECTIONS = 4;

/** `MAX_FILE_CONTENT_CHARS` in `project-context-service.ts` at the time of writing. */
const PER_FILE_BUDGET_CHARS = 16_000;

const FILE_NAME = 'qa-retrieval-depth.txt';
const CANARY = 'HALYARD-4417';
const FILLER_PARAGRAPH =
  'Routine operational notes for the quarter, recorded for completeness. ' +
  'Nothing in this paragraph identifies a value, a code, or a name. ' +
  'It exists to place distance between the top of the document and the record below. ';

test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

/**
 * A document whose only distinguishing fact sits near the end.
 *
 * The filler is deliberately uniform: BM25 must select the canary window on the
 * question's terms, not because the surrounding text happens to differ.
 */
function buildDocument(): string {
  const target = PER_FILE_BUDGET_CHARS * 4;
  const parts: string[] = ['Field log, retrieval depth fixture.', ''];
  let length = 0;
  while (length < target * 0.9) {
    parts.push(FILLER_PARAGRAPH);
    length += FILLER_PARAGRAPH.length;
  }
  parts.push('', `The mooring designation for the north berth is ${CANARY}.`, '');
  while (length < target) {
    parts.push(FILLER_PARAGRAPH);
    length += FILLER_PARAGRAPH.length;
  }
  return parts.join('\n');
}

async function dismissConsent(page: Page): Promise<void> {
  await page
    .getByLabel(CONSENT_DISMISS_LABEL)
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

async function openFirstProject(page: Page): Promise<void> {
  await page.goto(PROJECTS_ROUTE, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);

  const card = page.getByRole('button', { name: /^Open project / }).first();
  await expect(card).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  await card.click();

  await expect(page).toHaveURL(/\/chat\/projects\/[^/]+$/, { timeout: LOAD_TIMEOUT_MS });
  await expect(page.getByLabel(COMPOSER_LABEL)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

/**
 * Upload through the panel's own file input.
 *
 * The panel lives behind the project's Sources tab and is not mounted until
 * that tab is selected, which is what made the drop zone look absent on a
 * freshly loaded project. The composer sits above the tabs and stays mounted,
 * so the tab does not have to be switched back afterwards.
 *
 * The visible affordance is a drop zone whose label changes with the panel's
 * load state; the input behind it does not, and `setInputFiles` drives a hidden
 * input the same way the drop does.
 */
async function openSourcesTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: SOURCES_TAB }).click({ timeout: LOAD_TIMEOUT_MS });
  await expect(page.locator(SOURCES_FILE_INPUT)).toBeAttached({ timeout: LOAD_TIMEOUT_MS });
}

async function uploadKnowledgeFile(page: Page, body: string): Promise<void> {
  await openSourcesTab(page);
  await page.locator(SOURCES_FILE_INPUT).setInputFiles({
    name: FILE_NAME,
    mimeType: 'text/plain',
    buffer: Buffer.from(body, 'utf8'),
  });
  await expect(page.getByText(FILE_NAME).first()).toBeVisible({ timeout: EXTRACTION_TIMEOUT_MS });
}

async function removeKnowledgeFile(page: Page): Promise<void> {
  await page
    .getByLabel(`Remove ${FILE_NAME}`)
    .first()
    .click({ timeout: LOAD_TIMEOUT_MS })
    .catch(() => undefined);
  await page
    .getByRole('button', { name: /^Remove file$/i })
    .first()
    .click({ timeout: 10_000 })
    .catch(() => undefined);
}

/**
 * Refuse whatever the agent reaches for, and let it answer from the file.
 *
 * A project's composer sends AGI Work, which is an agent loop, and it reaches
 * for code execution even on a question that only needs to read a file. That
 * correctly stops for approval. Approving a code run from a test would be the
 * wrong way out; rejecting is the same decision a user makes when the tool is
 * not what they asked for, and it leaves the retrieval path under test.
 *
 * The approve and reject controls are inside the collapsed agent activity row,
 * so the row has to be expanded before either is reachable.
 */
async function rejectAgentToolRequest(page: Page): Promise<number> {
  let rejected = 0;
  for (let attempt = 0; attempt < MAX_TOOL_REJECTIONS; attempt += 1) {
    const collapsed = page.getByLabel(AGENT_ACTIVITY_LABEL).first();
    if (await collapsed.isVisible().catch(() => false)) {
      await collapsed.click().catch(() => undefined);
    }
    const reject = page.getByRole('button', { name: REJECT_LABEL, exact: true }).first();
    if (!(await reject.isVisible().catch(() => false))) break;
    await reject.click().catch(() => undefined);
    rejected += 1;
    await page.waitForTimeout(APPROVAL_SETTLE_MS);
  }
  return rejected;
}

async function settledAnswer(page: Page): Promise<string> {
  const assistant = page.locator(ASSISTANT_BUBBLE).last();
  await expect(assistant).toBeVisible({ timeout: ANSWER_TIMEOUT_MS });
  await expect(page.getByLabel(STOP_BUTTON_LABEL)).toBeHidden({ timeout: ANSWER_TIMEOUT_MS });
  await page.waitForTimeout(1_500);
  return assistant.innerText();
}

test.describe('project knowledge retrieval reaches the back of a long file', () => {
  /**
   * Skipped, and the skip records what is still missing.
   *
   * Project knowledge only reaches a turn through a conversation whose row
   * carries `project_id`, and the only composer that sets it is a project's
   * own, which sends AGI Work. AGI Work is an agent loop: asked for a value
   * sitting in an uploaded file, it reached for code execution on every
   * attempt and stopped for approval. `handleWorkModeChange` in
   * `ChatInput.tsx` clears the project when the user picks Chat, by design, so
   * there is no mode in which this question can be asked without entering that
   * loop, and refusing the tool from the activity row did not release the turn
   * to answer from context either.
   *
   * `AGI-25`, the false "finished without returning a response" this used to
   * hit, is fixed: the paused turn now reads "Agent activity paused / Review
   * Execute Code action" and nothing more, confirmed by this spec's own last
   * run. What remains is `AGI-26`, the turn not resuming.
   *
   * Everything up to the question is verified and left executable: the upload
   * lands, the Sources panel takes it, and the document is four times the
   * per-file budget with its canary at nine tenths. It must not be turned
   * green by approving a code run.
   *
   * llm-guardrail-allow: AGI-26, a refused tool does not release the turn
   */
  test.skip('answers from a passage far past the per-file budget', async ({ page }) => {
    await signIn(page);
    await openFirstProject(page);

    const document = buildDocument();
    expect(document.length).toBeGreaterThan(PER_FILE_BUDGET_CHARS * 3);
    expect(document.indexOf(CANARY)).toBeGreaterThan(PER_FILE_BUDGET_CHARS);

    try {
      await uploadKnowledgeFile(page, document);

      const composer = page.getByLabel(COMPOSER_LABEL);
      await composer.click();
      await composer.fill(
        'What is the mooring designation for the north berth? ' +
          'Reply with the designation only.',
      );
      await composer.press('Enter');

      await expect(page.locator(ASSISTANT_BUBBLE).last()).toBeVisible({
        timeout: ANSWER_TIMEOUT_MS,
      });
      await page.waitForTimeout(APPROVAL_SETTLE_MS);
      const rejected = await rejectAgentToolRequest(page);
      expect(rejected).toBeGreaterThanOrEqual(0);

      const answer = await settledAnswer(page);
      expect(answer).toContain(CANARY);
    } finally {
      await openFirstProject(page);
      await openSourcesTab(page);
      await removeKnowledgeFile(page);
    }
  });
});
