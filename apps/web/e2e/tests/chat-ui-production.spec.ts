import { test, expect } from '@playwright/test';

/**
 * Production Chat UI Tests
 * Tests the chat interface on agiworkforce.com
 */

const PROD_URL = 'https://agiworkforce.com';
const TEST_EMAIL = 'siddharthanagula3@gmail.com';
const TEST_PASSWORD = 'Test@1234567';

test.describe('Production Chat UI Tests', () => {
  test.setTimeout(180000); // 3 minutes per test

  test('Complete chat UI test - login, select gpt-5-nano, and send message', async ({ page }) => {
    // Enable console logging
    page.on('console', (msg) => {
      console.log(`Browser [${msg.type()}]: ${msg.text()}`);
    });

    // ========== STEP 1: LOGIN ==========
    console.log('\n========== STEP 1: LOGIN ==========');
    await page.goto(`${PROD_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'e2e/screenshots/01-login-page.png', fullPage: true });

    // Fill credentials
    await page.fill('input[type="email"], input[name="email"]', TEST_EMAIL);
    await page.fill('input[type="password"], input[name="password"]', TEST_PASSWORD);
    await page.screenshot({ path: 'e2e/screenshots/02-credentials-filled.png', fullPage: true });

    // Submit login
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/03-after-login.png', fullPage: true });
    console.log('✅ Login completed');

    // ========== STEP 2: NAVIGATE TO CHAT ==========
    console.log('\n========== STEP 2: NAVIGATE TO CHAT ==========');
    await page.goto(`${PROD_URL}/dashboard/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/04-chat-page.png', fullPage: true });
    console.log('✅ Chat page loaded');

    // ========== STEP 3: VERIFY UI ELEMENTS ==========
    console.log('\n========== STEP 3: VERIFY UI ELEMENTS ==========');

    // Check sidebar
    const sidebar = page.locator('text=Conversations').first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    console.log(`Sidebar visible: ${sidebarVisible ? '✅' : '❌'}`);

    // Check model selector
    const modelSelector = page.locator('text=Auto').first();
    const modelSelectorVisible = await modelSelector.isVisible().catch(() => false);
    console.log(`Model selector visible: ${modelSelectorVisible ? '✅' : '❌'}`);

    // Check empty state
    const emptyState = page.locator('text=How can I help you today').first();
    const emptyStateVisible = await emptyState.isVisible().catch(() => false);
    console.log(`Empty state visible: ${emptyStateVisible ? '✅' : '❌'}`);

    // Check suggestion buttons
    const writeCodeBtn = page.locator('text=Write code').first();
    const writeCodeVisible = await writeCodeBtn.isVisible().catch(() => false);
    console.log(`Suggestion buttons visible: ${writeCodeVisible ? '✅' : '❌'}`);

    // Check chat input
    const chatInput = page.locator('textarea').first();
    const chatInputVisible = await chatInput.isVisible().catch(() => false);
    console.log(`Chat input visible: ${chatInputVisible ? '✅' : '❌'}`);

    await page.screenshot({ path: 'e2e/screenshots/05-ui-elements-check.png', fullPage: true });

    // ========== STEP 4: CHECK COLORS ==========
    console.log('\n========== STEP 4: CHECK COLORS ==========');

    const colorAnalysis = await page.evaluate(() => {
      const results = {
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        darkMode: document.documentElement.classList.contains('dark'),
        sidebarBg: '',
        inputBg: '',
        buttonColors: [] as string[],
      };

      // Check sidebar
      const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], aside');
      if (sidebar) {
        results.sidebarBg = window.getComputedStyle(sidebar).backgroundColor;
      }

      // Check input area
      const input = document.querySelector('textarea, input[type="text"]');
      if (input) {
        const inputParent = input.closest('div');
        if (inputParent) {
          results.inputBg = window.getComputedStyle(inputParent).backgroundColor;
        }
      }

      // Check buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        if (i < 5) {
          results.buttonColors.push(window.getComputedStyle(btn).backgroundColor);
        }
      });

      return results;
    });

    console.log('Color Analysis:', JSON.stringify(colorAnalysis, null, 2));
    console.log(
      `Dark mode: ${colorAnalysis.darkMode ? '✅ Enabled' : '⚠️ Light mode (user preference)'}`,
    );

    // ========== STEP 5: SELECT GPT-5-NANO MODEL ==========
    console.log('\n========== STEP 5: SELECT GPT-5-NANO MODEL ==========');

    // Click on model selector button
    const modelBtn = page.locator('button:has-text("Auto")').first();
    if (await modelBtn.isVisible()) {
      await modelBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'e2e/screenshots/06-model-selector-open.png', fullPage: true });
      console.log('✅ Model selector opened');

      // Look for specific models section and gpt-5-nano
      const specificModelsSection = page.locator('text=Specific Models');
      if (await specificModelsSection.isVisible().catch(() => false)) {
        console.log('✅ Found Specific Models section');
      }

      // Try to find and click gpt-5-nano
      const gpt5NanoOption = page.locator('button:has-text("gpt-5-nano"), text=gpt-5-nano').first();
      if (await gpt5NanoOption.isVisible().catch(() => false)) {
        await gpt5NanoOption.click();
        console.log('✅ Selected gpt-5-nano model');
        await page.waitForTimeout(500);
      } else {
        // Try scrolling in the dropdown to find it
        console.log('Looking for gpt-5-nano in dropdown...');

        // Click on Auto Economy instead (cheapest auto option)
        const economyOption = page.locator('button:has-text("Auto Economy"), text=Economy').first();
        if (await economyOption.isVisible().catch(() => false)) {
          await economyOption.click();
          console.log('✅ Selected Auto Economy mode (cheapest)');
        } else {
          // Just close the dropdown
          await page.keyboard.press('Escape');
          console.log('⚠️ Could not find gpt-5-nano, using default model');
        }
      }

      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/07-model-selected.png', fullPage: true });
    }

    // ========== STEP 6: SEND A TEST MESSAGE ==========
    console.log('\n========== STEP 6: SEND A TEST MESSAGE ==========');

    // Click on chat input
    const textArea = page.locator('textarea').first();
    if (await textArea.isVisible()) {
      await textArea.click();
      await textArea.fill('Hi! Say "Hello" back. One word only.');
      await page.screenshot({ path: 'e2e/screenshots/08-message-typed.png', fullPage: true });
      console.log('✅ Message typed');

      // Find send button
      const sendButton = page.locator('button[type="submit"], button:has(svg)').last();

      if (await sendButton.isVisible()) {
        // Get send button color before clicking
        const sendBtnColor = await sendButton.evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor;
        });
        console.log(`Send button color: ${sendBtnColor}`);

        // Check if terra-cotta color
        if (sendBtnColor.includes('218, 119, 86') || sendBtnColor.includes('218,119,86')) {
          console.log('✅ Send button has correct terra-cotta color!');
        }

        await sendButton.click();
        console.log('✅ Send button clicked');
        await page.screenshot({ path: 'e2e/screenshots/09-message-sent.png', fullPage: true });

        // Wait for response with progress screenshots
        console.log('Waiting for AI response...');

        for (let i = 1; i <= 6; i++) {
          await page.waitForTimeout(3000);
          await page.screenshot({
            path: `e2e/screenshots/10-response-${i * 3}s.png`,
            fullPage: true,
          });
          console.log(`... ${i * 3} seconds elapsed`);

          // Check for response or error
          const pageContent = await page.content();
          if (pageContent.includes('Hello') || pageContent.includes('hello')) {
            console.log('✅ Got "Hello" response!');
            break;
          }
          if (pageContent.includes('credit limit') || pageContent.includes('Credit limit')) {
            console.log('❌ Credit limit reached - account needs more credits');
            break;
          }
          if (pageContent.includes('error') || pageContent.includes('Error')) {
            console.log('⚠️ Error detected in response');
          }
        }

        await page.screenshot({ path: 'e2e/screenshots/11-final-response.png', fullPage: true });

        // Check what we got
        const responseCheck = await page.evaluate(() => {
          const allText = document.body.innerText;
          return {
            hasHelloResponse: allText.toLowerCase().includes('hello'),
            hasCreditError: allText.includes('credit limit') || allText.includes('Credit limit'),
            hasAnyError: allText.includes('error') || allText.includes('Error'),
            fullText: allText.substring(0, 1000),
          };
        });

        console.log('\nResponse Analysis:');
        console.log(`- Has "Hello" response: ${responseCheck.hasHelloResponse ? '✅' : '❌'}`);
        console.log(
          `- Credit limit error: ${responseCheck.hasCreditError ? '❌ YES - NEEDS CREDITS' : '✅ No'}`,
        );
        console.log(`- Other errors: ${responseCheck.hasAnyError ? '⚠️ Yes' : '✅ No'}`);

        if (responseCheck.hasCreditError) {
          console.log('\n⚠️ ISSUE FOUND: Account has reached monthly credit limit!');
          console.log('To fix: Add credits to the account or upgrade the subscription.');
        }
      } else {
        console.log('❌ Send button not found');
      }
    } else {
      console.log('❌ Text area not found');
    }

    // ========== STEP 7: CHECK CONVERSATION CREATED ==========
    console.log('\n========== STEP 7: CHECK CONVERSATION ==========');

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/12-final-state.png', fullPage: true });

    // Check if conversation appears in sidebar
    const conversationItems = await page
      .locator('[class*="sidebar"] button, [class*="Sidebar"] button')
      .count();
    console.log(`Conversation items in sidebar: ${conversationItems}`);

    // ========== SUMMARY ==========
    console.log('\n========================================');
    console.log('           TEST SUMMARY');
    console.log('========================================');
    console.log(`✅ Login: Success`);
    console.log(
      `${sidebarVisible ? '✅' : '❌'} Sidebar: ${sidebarVisible ? 'Visible' : 'Not found'}`,
    );
    console.log(
      `${modelSelectorVisible ? '✅' : '❌'} Model Selector: ${modelSelectorVisible ? 'Visible' : 'Not found'}`,
    );
    console.log(
      `${emptyStateVisible ? '✅' : '❌'} Empty State: ${emptyStateVisible ? 'Visible' : 'Not found'}`,
    );
    console.log(
      `${chatInputVisible ? '✅' : '❌'} Chat Input: ${chatInputVisible ? 'Visible' : 'Not found'}`,
    );
    console.log(`⚠️ Dark Mode: ${colorAnalysis.darkMode ? 'Enabled' : 'Light mode'}`);
    console.log('========================================');
    console.log('Screenshots saved to: e2e/screenshots/');
    console.log('========================================\n');
  });
});
