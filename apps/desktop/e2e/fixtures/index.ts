import { test as base, expect } from '@playwright/test';
import { ChatPage } from '../page-objects/ChatPage';
import { AutomationPage } from '../page-objects/AutomationPage';
import { AGIPage } from '../page-objects/AGIPage';
import { SettingsPage } from '../page-objects/SettingsPage';
import { OnboardingPage } from '../page-objects/OnboardingPage';
import { TestDatabase } from '../utils/test-database';
import { MockLLMProvider } from '../utils/mock-llm-provider';
import { ScreenshotHelper } from '../utils/screenshot-helper';
import { WaitHelper } from '../utils/wait-helper';

// Extend Playwright's base test with custom fixtures
type CustomFixtures = {
  chatPage: ChatPage;
  automationPage: AutomationPage;
  agiPage: AGIPage;
  settingsPage: SettingsPage;
  onboardingPage: OnboardingPage;
  testDb: TestDatabase;
  mockLLM: MockLLMProvider;
  screenshot: ScreenshotHelper;
  waitHelper: WaitHelper;
};

export const test = base.extend<CustomFixtures>({
  // Page Object fixtures
  chatPage: async ({ page }, use) => {
    const chatPage = new ChatPage(page);
    await use(chatPage);
  },

  automationPage: async ({ page }, use) => {
    const automationPage = new AutomationPage(page);
    await use(automationPage);
  },

  agiPage: async ({ page }, use) => {
    const agiPage = new AGIPage(page);
    await use(agiPage);
  },

  settingsPage: async ({ page }, use) => {
    const settingsPage = new SettingsPage(page);
    await use(settingsPage);
  },

  onboardingPage: async ({ page }, use) => {
    const onboardingPage = new OnboardingPage(page);
    await use(onboardingPage);
  },

  // Test database fixture
  testDb: async ({ page: _page }, use) => {
    const db = new TestDatabase();
    await db.initialize();
    await use(db);
    await db.cleanup();
  },

  // Mock LLM provider fixture
  mockLLM: async ({ page }, use) => {
    const mockLLM = new MockLLMProvider(page);
    await mockLLM.setup();
    await use(mockLLM);
    await mockLLM.teardown();
  },

  // Screenshot helper fixture
  screenshot: async ({ page }, use) => {
    const helper = new ScreenshotHelper(page);
    await use(helper);
  },

  // Wait helper fixture
  waitHelper: async ({ page }, use) => {
    const helper = new WaitHelper(page);
    await use(helper);
  },
});

export { expect };
