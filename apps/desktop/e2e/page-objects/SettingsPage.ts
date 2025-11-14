import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class SettingsPage extends BasePage {
  // Locators
  readonly saveButton: Locator;
  readonly resetButton: Locator;
  readonly themeSelect: Locator;
  readonly languageSelect: Locator;

  constructor(page: Page) {
    super(page);
    this.saveButton = page.locator('button:has-text("Save"), [data-testid="save-settings"]').first();
    this.resetButton = page.locator('button:has-text("Reset"), [data-testid="reset-settings"]').first();
    this.themeSelect = page.locator('select[name="theme"], [data-testid="theme-select"]').first();
    this.languageSelect = page.locator('select[name="language"], [data-testid="language-select"]').first();
  }

  async navigateToSettings() {
    const settingsLink = this.page.locator('a[href*="settings"], button[aria-label*="Settings"]').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await this.waitForNetworkIdle();
    }
  }

  async changeTheme(theme: 'light' | 'dark' | 'system') {
    await this.themeSelect.selectOption(theme);
  }

  async configureProvider(provider: 'openai' | 'anthropic' | 'google' | 'ollama', apiKey?: string) {
    // Navigate to provider settings tab
    const providerTab = this.page.locator(`button:has-text("Providers"), [data-testid="providers-tab"]`).first();
    if (await providerTab.isVisible()) {
      await providerTab.click();
    }

    // Select provider
    const providerSelect = this.page.locator(`[data-testid="${provider}-provider"], button:has-text("${provider}")`).first();
    if (await providerSelect.isVisible()) {
      await providerSelect.click();
    }

    // Set API key if provided
    if (apiKey) {
      const apiKeyInput = this.page.locator('input[name="apiKey"], [data-testid="api-key-input"]').first();
      await apiKeyInput.fill(apiKey);
    }
  }

  async setResourceLimit(resource: 'cpu' | 'memory', value: string) {
    const input = this.page.locator(`input[name*="${resource}"], [data-testid="${resource}-limit"]`).first();
    await input.clear();
    await input.fill(value);
  }

  async toggleAutonomousMode(enable: boolean) {
    const toggle = this.page.locator('input[type="checkbox"][name*="autonomous"], [data-testid="autonomous-toggle"]').first();
    const isChecked = await toggle.isChecked();

    if ((enable && !isChecked) || (!enable && isChecked)) {
      await toggle.click();
    }
  }

  async toggleAutoApproval(enable: boolean) {
    const toggle = this.page.locator('input[type="checkbox"][name*="auto-approve"], [data-testid="auto-approve"]').first();
    const isChecked = await toggle.isChecked();

    if ((enable && !isChecked) || (!enable && isChecked)) {
      await toggle.click();
    }
  }

  async saveSettings() {
    await this.saveButton.click();
    // Wait for success message
    const successMessage = this.page.locator('[role="status"], .success-message').first();
    await successMessage.waitFor({ timeout: 5000 });
  }

  async resetSettings() {
    await this.resetButton.click();

    // Handle confirmation
    const confirmButton = this.page.locator('button:has-text("Reset"), button:has-text("Confirm")').first();
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for success message
    const successMessage = this.page.locator('[role="status"], .success-message').first();
    await successMessage.waitFor({ timeout: 5000 });
  }

  async isSettingsSaved(): Promise<boolean> {
    const successMessage = this.page.locator('[role="status"], .success-message').first();
    return await successMessage.isVisible({ timeout: 5000 }).catch(() => false);
  }
}
