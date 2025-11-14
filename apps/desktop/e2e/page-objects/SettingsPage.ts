import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { createErrorHandler } from '../utils/error-handler';

/**
 * Represents a snapshot of settings for test isolation
 */
export interface SettingsSnapshot {
  theme?: string;
  language?: string;
  resourceLimits?: {
    cpu?: string;
    memory?: string;
  };
  autonomousMode?: boolean;
  autoApproval?: boolean;
  providers?: {
    [key: string]: {
      apiKey?: string;
      enabled?: boolean;
    };
  };
}

export class SettingsPage extends BasePage {
  // Locators
  readonly saveButton: Locator;
  readonly resetButton: Locator;
  readonly themeSelect: Locator;
  readonly languageSelect: Locator;

  constructor(page: Page) {
    super(page);
    this.saveButton = page
      .locator('button:has-text("Save"), [data-testid="save-settings"]')
      .first();
    this.resetButton = page
      .locator('button:has-text("Reset"), [data-testid="reset-settings"]')
      .first();
    this.themeSelect = page.locator('select[name="theme"], [data-testid="theme-select"]').first();
    this.languageSelect = page
      .locator('select[name="language"], [data-testid="language-select"]')
      .first();
  }

  async navigateToSettings() {
    const settingsLink = this.page
      .locator('a[href*="settings"], button[aria-label*="Settings"]')
      .first();
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
    const providerTab = this.page
      .locator(`button:has-text("Providers"), [data-testid="providers-tab"]`)
      .first();
    if (await providerTab.isVisible()) {
      await providerTab.click();
    }

    // Select provider
    const providerSelect = this.page
      .locator(`[data-testid="${provider}-provider"], button:has-text("${provider}")`)
      .first();
    if (await providerSelect.isVisible()) {
      await providerSelect.click();
    }

    // Set API key if provided
    if (apiKey) {
      const apiKeyInput = this.page
        .locator('input[name="apiKey"], [data-testid="api-key-input"]')
        .first();
      await apiKeyInput.fill(apiKey);
    }
  }

  async setResourceLimit(resource: 'cpu' | 'memory', value: string) {
    const input = this.page
      .locator(`input[name*="${resource}"], [data-testid="${resource}-limit"]`)
      .first();
    await input.clear();
    await input.fill(value);
  }

  async toggleAutonomousMode(enable: boolean) {
    const toggle = this.page
      .locator('input[type="checkbox"][name*="autonomous"], [data-testid="autonomous-toggle"]')
      .first();
    const isChecked = await toggle.isChecked();

    if ((enable && !isChecked) || (!enable && isChecked)) {
      await toggle.click();
    }
  }

  async toggleAutoApproval(enable: boolean) {
    const toggle = this.page
      .locator('input[type="checkbox"][name*="auto-approve"], [data-testid="auto-approve"]')
      .first();
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
    const errorHandler = createErrorHandler(this.page);
    await this.resetButton.click();

    // Handle confirmation
    const confirmButton = this.page
      .locator('button:has-text("Reset"), button:has-text("Confirm")')
      .first();
    if (await errorHandler.isElementVisible(confirmButton, 2000)) {
      await errorHandler.safeClick(confirmButton);
    }

    // Wait for success message
    const successMessage = this.page.locator('[role="status"], .success-message').first();
    await successMessage.waitFor({ timeout: 5000 });
  }

  async isSettingsSaved(): Promise<boolean> {
    const errorHandler = createErrorHandler(this.page);
    const successMessage = this.page.locator('[role="status"], .success-message').first();
    return await errorHandler.isElementVisible(successMessage, 5000);
  }

  /**
   * Capture current settings state for test isolation
   * Saves theme, resource limits, autonomy settings, and provider configurations
   */
  async captureCurrentSettings(): Promise<SettingsSnapshot> {
    const snapshot: SettingsSnapshot = {};

    try {
      await this.navigateToSettings();

      // Capture theme
      try {
        const themeValue = await this.themeSelect.inputValue().catch(() => '');
        if (themeValue) {
          snapshot.theme = themeValue;
        }
      } catch (error) {
        console.debug('Could not capture theme:', error);
      }

      // Capture language
      try {
        const languageValue = await this.languageSelect.inputValue().catch(() => '');
        if (languageValue) {
          snapshot.language = languageValue;
        }
      } catch (error) {
        console.debug('Could not capture language:', error);
      }

      // Capture resource limits
      try {
        const cpuInput = this.page.locator('input[name*="cpu"], [data-testid="cpu-limit"]').first();
        const memoryInput = this.page
          .locator('input[name*="memory"], [data-testid="memory-limit"]')
          .first();

        const cpuValue = await cpuInput.inputValue().catch(() => '');
        const memoryValue = await memoryInput.inputValue().catch(() => '');

        if (cpuValue || memoryValue) {
          snapshot.resourceLimits = {};
          if (cpuValue) snapshot.resourceLimits.cpu = cpuValue;
          if (memoryValue) snapshot.resourceLimits.memory = memoryValue;
        }
      } catch (error) {
        console.debug('Could not capture resource limits:', error);
      }

      // Capture autonomous mode
      try {
        const autonomousToggle = this.page
          .locator('input[type="checkbox"][name*="autonomous"], [data-testid="autonomous-toggle"]')
          .first();
        const isChecked = await autonomousToggle.isChecked().catch(() => false);
        snapshot.autonomousMode = isChecked;
      } catch (error) {
        console.debug('Could not capture autonomous mode:', error);
      }

      // Capture auto-approval
      try {
        const autoApprovalToggle = this.page
          .locator('input[type="checkbox"][name*="auto-approve"], [data-testid="auto-approve"]')
          .first();
        const isChecked = await autoApprovalToggle.isChecked().catch(() => false);
        snapshot.autoApproval = isChecked;
      } catch (error) {
        console.debug('Could not capture auto-approval:', error);
      }

      return snapshot;
    } catch (error) {
      console.error('Error capturing settings:', error);
      return {};
    }
  }

  /**
   * Restore settings from a previously captured snapshot
   * Used in test.afterEach() for test isolation
   * Handles errors gracefully without throwing
   */
  async restoreFromSnapshot(snapshot: SettingsSnapshot): Promise<void> {
    if (!snapshot || Object.keys(snapshot).length === 0) {
      console.warn('Empty snapshot provided; skipping restoration');
      return;
    }

    const errors: string[] = [];

    try {
      await this.navigateToSettings();

      // Restore theme
      if (snapshot.theme) {
        try {
          await this.changeTheme((snapshot.theme as 'light' | 'dark' | 'system') || 'system');
        } catch (error) {
          errors.push(`Theme restoration failed: ${error}`);
        }
      }

      // Restore language
      if (snapshot.language) {
        try {
          await this.languageSelect.selectOption(snapshot.language);
        } catch (error) {
          errors.push(`Language restoration failed: ${error}`);
        }
      }

      // Restore resource limits
      if (snapshot.resourceLimits) {
        try {
          if (snapshot.resourceLimits.cpu) {
            await this.setResourceLimit('cpu', snapshot.resourceLimits.cpu);
          }
          if (snapshot.resourceLimits.memory) {
            await this.setResourceLimit('memory', snapshot.resourceLimits.memory);
          }
        } catch (error) {
          errors.push(`Resource limits restoration failed: ${error}`);
        }
      }

      // Restore autonomous mode
      if (snapshot.autonomousMode !== undefined) {
        try {
          await this.toggleAutonomousMode(snapshot.autonomousMode);
        } catch (error) {
          errors.push(`Autonomous mode restoration failed: ${error}`);
        }
      }

      // Restore auto-approval
      if (snapshot.autoApproval !== undefined) {
        try {
          await this.toggleAutoApproval(snapshot.autoApproval);
        } catch (error) {
          errors.push(`Auto-approval restoration failed: ${error}`);
        }
      }

      // Save all changes
      try {
        await this.saveSettings();
      } catch (error) {
        errors.push(`Settings save failed: ${error}`);
      }

      if (errors.length > 0) {
        console.warn('Settings restoration completed with errors:', errors);
      } else {
        console.log('Settings successfully restored');
      }
    } catch (error) {
      console.error('Critical error during settings restoration:', error);
    }
  }

  /**
   * Get current value of a resource limit
   * @param resource 'cpu' or 'memory'
   * @returns The current value as a string, or empty string if not found
   */
  async getResourceLimitValue(resource: 'cpu' | 'memory'): Promise<string> {
    try {
      const input = this.page
        .locator(`input[name*="${resource}"], [data-testid="${resource}-limit"]`)
        .first();
      return await input.inputValue().catch(() => '');
    } catch (error) {
      console.debug(`Could not get ${resource} limit value:`, error);
      return '';
    }
  }

  /**
   * Get current theme setting
   * @returns The current theme value, or 'system' if not found
   */
  async getCurrentTheme(): Promise<string> {
    try {
      return await this.themeSelect.inputValue().catch(() => 'system');
    } catch (error) {
      console.debug('Could not get current theme:', error);
      return 'system';
    }
  }
}
