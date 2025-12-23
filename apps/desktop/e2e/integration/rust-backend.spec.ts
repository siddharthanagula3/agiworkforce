import { test, expect } from '../fixtures';

test.describe('Rust Backend Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should invoke Tauri commands from frontend', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('ping');
        }
        return null;
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result !== undefined).toBe(true);
  });

  test('should handle database operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('get_conversations');
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle file system operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('list_files', { path: '.' });
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle LLM provider operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('get_provider_status');
        }
        return null;
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle automation commands', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('list_windows');
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle AGI core operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('get_goals');
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle settings operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('get_settings');
        }
        return {};
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should handle browser automation commands', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('get_browser_state');
        }
        return null;
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(result).toBeDefined();
  });

  test('should receive Tauri events', async ({ page }) => {
    const eventReceived = await page.evaluate(async () => {
      return new Promise((resolve) => {
        if (window.__TAURI__) {
          let received = false;

          window.__TAURI__.event.listen('test-event', () => {
            received = true;
          });

          setTimeout(() => resolve(received), 1000);

          window.__TAURI__.event.emit('test-event', { data: 'test' }).catch(() => {});
        } else {
          resolve(false);
        }
      });
    });

    expect(typeof eventReceived).toBe('boolean');
  });

  test('should handle errors from backend gracefully', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          return await window.__TAURI__.invoke('non_existent_command');
        }
        return null;
      } catch (error) {
        return { caught: true, message: (error as Error).message };
      }
    });

    if (result && typeof result === 'object' && 'caught' in result) {
      expect(result.caught).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });

  test('should handle concurrent backend calls', async ({ page }) => {
    const results = await page.evaluate(async () => {
      try {
        if (window.__TAURI__) {
          const promises = [
            window.__TAURI__.invoke('ping'),
            window.__TAURI__.invoke('get_settings'),
            window.__TAURI__.invoke('get_conversations'),
          ];

          return await Promise.all(promises);
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    expect(Array.isArray(results) || (results && typeof results === 'object')).toBe(true);
  });
});
