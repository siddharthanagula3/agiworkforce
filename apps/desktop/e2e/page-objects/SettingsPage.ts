import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { createErrorHandler } from '../utils/error-handler';

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
  readonly saveButton: Locator;
  readonly resetButton: Locator;
  readonly themeSelect: Locator;
  readonly languageSelect: Locator;

  constructor(page: Page) {
    super(page);
    // Use semantic locators with fallback to test IDs
    this.saveButton = page
      .getByRole('button', { name: /save/i })
      .or(page.getByTestId('save-settings'))
      .first();
    this.resetButton = page
      .getByRole('button', { name: /reset/i })
      .or(page.getByTestId('reset-settings'))
      .first();
    this.themeSelect = page
      .getByRole('combobox', { name: /theme/i })
      .or(page.getByLabel(/theme/i))
      .or(page.getByTestId('theme-select'))
      .first();
    this.languageSelect = page
      .getByRole('combobox', { name: /language/i })
      .or(page.getByLabel(/language/i))
      .or(page.getByTestId('language-select'))
      .first();
  }

  async navigateToSettings() {
    // Use semantic navigation - prefer role-based or accessible locators
    const settingsLink = this.page
      .getByRole('link', { name: /settings/i })
      .or(this.page.getByRole('button', { name: /settings/i }))
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
    const providerTab = this.page
      .getByRole('tab', { name: /providers/i })
      .or(this.page.getByRole('button', { name: /providers/i }))
      .or(this.page.getByTestId('providers-tab'))
      .first();
    if (await providerTab.isVisible()) {
      await providerTab.click();
    }

    const providerSelect = this.page
      .getByTestId(`${provider}-provider`)
      .or(this.page.getByRole('button', { name: new RegExp(provider, 'i') }))
      .first();
    if (await providerSelect.isVisible()) {
      await providerSelect.click();
    }

    if (apiKey) {
      const apiKeyInput = this.page
        .getByLabel(/api key/i)
        .or(this.page.getByPlaceholder(/api key/i))
        .or(this.page.getByTestId('api-key-input'))
        .first();
      await apiKeyInput.fill(apiKey);
    }
  }

  async setResourceLimit(resource: 'cpu' | 'memory', value: string) {
    const input = this.page
      .getByLabel(new RegExp(resource, 'i'))
      .or(this.page.getByTestId(`${resource}-limit`))
      .first();
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      await input.clear();
      await input.fill(value);
    }
  }

  async toggleAutonomousMode(enable: boolean) {
    const toggle = this.page
      .getByRole('checkbox', { name: /autonomous/i })
      .or(this.page.getByLabel(/autonomous/i))
      .or(this.page.getByTestId('autonomous-toggle'))
      .first();
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = await toggle.isChecked();

      if ((enable && !isChecked) || (!enable && isChecked)) {
        await toggle.click();
      }
    }
  }

  async toggleAutoApproval(enable: boolean) {
    const toggle = this.page
      .getByRole('checkbox', { name: /auto.?approv/i })
      .or(this.page.getByLabel(/auto.?approv/i))
      .or(this.page.getByTestId('auto-approve'))
      .first();
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = await toggle.isChecked();

      if ((enable && !isChecked) || (!enable && isChecked)) {
        await toggle.click();
      }
    }
  }

  async saveSettings() {
    if (await this.saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.saveButton.click();

      const successMessage = this.page
        .getByRole('status')
        .or(this.page.locator('.success-message'))
        .first();
      await successMessage.waitFor({ timeout: 5000 }).catch(() => {});
    }
  }

  async resetSettings() {
    const errorHandler = createErrorHandler(this.page);
    if (await this.resetButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.resetButton.click();

      const confirmButton = this.page.getByRole('button', { name: /reset|confirm/i }).first();
      if (await errorHandler.isElementVisible(confirmButton, 2000)) {
        await errorHandler.safeClick(confirmButton);
      }

      const successMessage = this.page
        .getByRole('status')
        .or(this.page.locator('.success-message'))
        .first();
      await successMessage.waitFor({ timeout: 5000 }).catch(() => {});
    }
  }

  async isSettingsSaved(): Promise<boolean> {
    const errorHandler = createErrorHandler(this.page);
    const successMessage = this.page
      .getByRole('status')
      .or(this.page.locator('.success-message'))
      .first();
    return await errorHandler.isElementVisible(successMessage, 5000);
  }

  async captureCurrentSettings(): Promise<SettingsSnapshot> {
    const snapshot: SettingsSnapshot = {};

    try {
      await this.navigateToSettings();

      try {
        const themeValue = await this.themeSelect.inputValue().catch(() => '');
        if (themeValue) {
          snapshot.theme = themeValue;
        }
      } catch (error) {
        console.debug('Could not capture theme:', error);
      }

      try {
        const languageValue = await this.languageSelect.inputValue().catch(() => '');
        if (languageValue) {
          snapshot.language = languageValue;
        }
      } catch (error) {
        console.debug('Could not capture language:', error);
      }

      try {
        const cpuInput = this.page
          .getByLabel(/cpu/i)
          .or(this.page.getByTestId('cpu-limit'))
          .first();
        const memoryInput = this.page
          .getByLabel(/memory/i)
          .or(this.page.getByTestId('memory-limit'))
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

      try {
        const autonomousToggle = this.page
          .getByRole('checkbox', { name: /autonomous/i })
          .or(this.page.getByTestId('autonomous-toggle'))
          .first();
        const isChecked = await autonomousToggle.isChecked().catch(() => false);
        snapshot.autonomousMode = isChecked;
      } catch (error) {
        console.debug('Could not capture autonomous mode:', error);
      }

      try {
        const autoApprovalToggle = this.page
          .getByRole('checkbox', { name: /auto.?approv/i })
          .or(this.page.getByTestId('auto-approve'))
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

  async restoreFromSnapshot(snapshot: SettingsSnapshot): Promise<void> {
    if (!snapshot || Object.keys(snapshot).length === 0) {
      console.warn('Empty snapshot provided; skipping restoration');
      return;
    }

    const errors: string[] = [];

    try {
      await this.navigateToSettings();

      if (snapshot.theme) {
        try {
          await this.changeTheme((snapshot.theme as 'light' | 'dark' | 'system') || 'system');
        } catch (error) {
          errors.push(`Theme restoration failed: ${error}`);
        }
      }

      if (snapshot.language) {
        try {
          await this.languageSelect.selectOption(snapshot.language);
        } catch (error) {
          errors.push(`Language restoration failed: ${error}`);
        }
      }

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

      if (snapshot.autonomousMode !== undefined) {
        try {
          await this.toggleAutonomousMode(snapshot.autonomousMode);
        } catch (error) {
          errors.push(`Autonomous mode restoration failed: ${error}`);
        }
      }

      if (snapshot.autoApproval !== undefined) {
        try {
          await this.toggleAutoApproval(snapshot.autoApproval);
        } catch (error) {
          errors.push(`Auto-approval restoration failed: ${error}`);
        }
      }

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

  async getResourceLimitValue(resource: 'cpu' | 'memory'): Promise<string> {
    try {
      const input = this.page
        .getByLabel(new RegExp(resource, 'i'))
        .or(this.page.getByTestId(`${resource}-limit`))
        .first();
      return await input.inputValue().catch(() => '');
    } catch (error) {
      console.debug(`Could not get ${resource} limit value:`, error);
      return '';
    }
  }

  async getCurrentTheme(): Promise<string> {
    try {
      return await this.themeSelect.inputValue().catch(() => 'system');
    } catch (error) {
      console.debug('Could not get current theme:', error);
      return 'system';
    }
  }
}
