import { Page } from '@playwright/test';
import { SettingsPage } from '../page-objects/SettingsPage';

export interface SettingsSnapshot {
  theme?: string;
  resourceLimits?: {
    cpu?: string;
    memory?: string;
  };
  autonomousMode?: boolean;
  autoApproval?: boolean;
  providers?: {
    [key: string]: string;
  };
  localStorageState?: {
    [key: string]: string;
  };
  indexedDbState?: unknown;
}

export class SettingsCleanup {
  private page: Page;
  private settingsPage: SettingsPage;
  private snapshot: SettingsSnapshot = {};
  private isInitialized = false;

  constructor(page: Page, settingsPage: SettingsPage) {
    this.page = page;
    this.settingsPage = settingsPage;
  }

  async captureSettings(): Promise<SettingsSnapshot> {
    try {
      await this.settingsPage.navigateToSettings();

      const snapshot: SettingsSnapshot = {};

      try {
        const themeValue = await this.settingsPage.themeSelect.inputValue().catch(() => '');
        if (themeValue) {
          snapshot.theme = themeValue;
        }
      } catch (error) {
        console.debug('Could not capture theme setting:', error);
      }

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

      try {
        const autonomousToggle = this.page
          .locator('input[type="checkbox"][name*="autonomous"], [data-testid="autonomous-toggle"]')
          .first();
        const isChecked = await autonomousToggle.isChecked().catch(() => false);
        snapshot.autonomousMode = isChecked;
      } catch (error) {
        console.debug('Could not capture autonomous mode:', error);
      }

      try {
        const autoApprovalToggle = this.page
          .locator('input[type="checkbox"][name*="auto-approve"], [data-testid="auto-approve"]')
          .first();
        const isChecked = await autoApprovalToggle.isChecked().catch(() => false);
        snapshot.autoApproval = isChecked;
      } catch (error) {
        console.debug('Could not capture auto-approval setting:', error);
      }

      try {
        const localStorageState = await this.page.evaluate(() => {
          const state: { [key: string]: string } = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              state[key] = localStorage.getItem(key) || '';
            }
          }
          return state;
        });
        snapshot.localStorageState = localStorageState;
      } catch (error) {
        console.debug('Could not capture localStorage state:', error);
      }

      this.snapshot = snapshot;
      this.isInitialized = true;

      console.log('Settings snapshot captured:', snapshot);
      return snapshot;
    } catch (error) {
      console.error('Failed to capture settings:', error);
      throw error;
    }
  }

  async restoreSettings(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Settings were not captured; skipping restoration');
      return;
    }

    const errors: string[] = [];

    try {
      await this.settingsPage.navigateToSettings();

      if (this.snapshot.theme) {
        try {
          await this.settingsPage.changeTheme((this.snapshot.theme as any) || 'system');
        } catch (error) {
          const msg = `Failed to restore theme: ${error}`;
          console.warn(msg);
          errors.push(msg);
        }
      }

      if (this.snapshot.resourceLimits) {
        try {
          if (this.snapshot.resourceLimits.cpu) {
            await this.settingsPage.setResourceLimit('cpu', this.snapshot.resourceLimits.cpu);
          }
          if (this.snapshot.resourceLimits.memory) {
            await this.settingsPage.setResourceLimit('memory', this.snapshot.resourceLimits.memory);
          }
        } catch (error) {
          const msg = `Failed to restore resource limits: ${error}`;
          console.warn(msg);
          errors.push(msg);
        }
      }

      if (this.snapshot.autonomousMode !== undefined) {
        try {
          await this.settingsPage.toggleAutonomousMode(this.snapshot.autonomousMode);
        } catch (error) {
          const msg = `Failed to restore autonomous mode: ${error}`;
          console.warn(msg);
          errors.push(msg);
        }
      }

      if (this.snapshot.autoApproval !== undefined) {
        try {
          await this.settingsPage.toggleAutoApproval(this.snapshot.autoApproval);
        } catch (error) {
          const msg = `Failed to restore auto-approval: ${error}`;
          console.warn(msg);
          errors.push(msg);
        }
      }

      try {
        await this.settingsPage.saveSettings();
      } catch (error) {
        const msg = `Failed to save restored settings: ${error}`;
        console.warn(msg);
        errors.push(msg);
      }

      if (this.snapshot.localStorageState) {
        try {
          await this.page.evaluate((state) => {
            localStorage.clear();
            Object.entries(state).forEach(([key, value]) => {
              localStorage.setItem(key, value);
            });
          }, this.snapshot.localStorageState);
        } catch (error) {
          const msg = `Failed to restore localStorage state: ${error}`;
          console.warn(msg);
          errors.push(msg);
        }
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

  getSnapshot(): SettingsSnapshot {
    return this.snapshot;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  clearSnapshot(): void {
    this.snapshot = {};
    this.isInitialized = false;
  }
}

export async function cleanupSettings(context: {
  page: Page;
  settingsPage: SettingsPage;
}): Promise<void> {
  const cleanup = new SettingsCleanup(context.page, context.settingsPage);
  await cleanup.restoreSettings().catch((error) => {
    console.error('Settings cleanup failed:', error);
  });
}
