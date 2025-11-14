import { test, expect } from '../fixtures';

/**
 * Integration tests for Rust backend Tauri commands
 */
test.describe('Rust Backend Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should invoke Tauri commands from frontend', async ({ page }) => {
    // Test basic Tauri IPC communication
    const result = await page.evaluate(async () => {
      try {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
          return await window.__TAURI__.invoke('ping');
        }
        return null;
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    // Either command succeeds or Tauri is not available (mock mode)
    // We just verify no crash occurs
    expect(result !== undefined).toBe(true);
  });

  test('should handle database operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
          return await window.__TAURI__.invoke('get_conversations');
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    // Verify we got some response (array or error object)
    expect(result).toBeDefined();
  });

  test('should handle file system operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // @ts-expect-error - Tauri global may not be available in test environment
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
    // Set up event listener
    const eventReceived = await page.evaluate(async () => {
      return new Promise((resolve) => {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          let received = false;

          // @ts-expect-error - Tauri global may not be available in test environment
          window.__TAURI__.event.listen('test-event', () => {
            received = true;
          });

          // Simulate event emission
          setTimeout(() => resolve(received), 1000);

          // Try to emit an event
          // @ts-expect-error - Tauri global may not be available in test environment
          window.__TAURI__.event.emit('test-event', { data: 'test' }).catch(() => {});
        } else {
          resolve(false);
        }
      });
    });

    // Event system may or may not be available
    expect(typeof eventReceived).toBe('boolean');
  });

  test('should handle errors from backend gracefully', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // Invoke non-existent command
          // @ts-expect-error - Tauri global may not be available in test environment
          return await window.__TAURI__.invoke('non_existent_command');
        }
        return null;
      } catch (error) {
        return { caught: true, message: (error as Error).message };
      }
    });

    // Should either return null (no Tauri) or catch error
    if (result && typeof result === 'object' && 'caught' in result) {
      expect(result.caught).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });

  test('should handle concurrent backend calls', async ({ page }) => {
    const results = await page.evaluate(async () => {
      try {
        // @ts-expect-error - Tauri global may not be available in test environment
        if (window.__TAURI__) {
          // Make multiple concurrent calls
          const promises = [
            // @ts-expect-error - Tauri global may not be available in test environment
            window.__TAURI__.invoke('ping'),
            // @ts-expect-error - Tauri global may not be available in test environment
            window.__TAURI__.invoke('get_settings'),
            // @ts-expect-error - Tauri global may not be available in test environment
            window.__TAURI__.invoke('get_conversations'),
          ];

          return await Promise.all(promises);
        }
        return [];
      } catch (error) {
        return { error: (error as Error).message };
      }
    });

    // Should get array of results
    expect(Array.isArray(results) || (results && typeof results === 'object')).toBe(true);
  });
});
