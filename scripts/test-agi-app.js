const { chromium } = require('playwright');

(async () => {
  console.log('========================================');
  console.log('AGI Workforce Full Integration Test');
  console.log('========================================\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // Maximize window
    await page.setViewportSize({ width: 1280, height: 720 });

    console.log('1. Loading app on http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    console.log('   ✓ Page loaded');

    // Wait and check for login form
    await page.waitForTimeout(2000);
    const loginEmail = await page.$('input[type="email"]');

    if (loginEmail) {
      console.log('\n2. Signing in with test account...');
      const testEmail = process.env.TEST_EMAIL;
      const testPassword = process.env.TEST_PASSWORD;
      if (!testEmail || !testPassword) {
        throw new Error('TEST_EMAIL and TEST_PASSWORD environment variables are required');
      }
      await page.fill('input[type="email"]', testEmail);
      console.log('   ✓ Email entered');

      // Wait a moment
      await page.waitForTimeout(500);

      // Check for password field
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await page.fill('input[type="password"]', testPassword);
        console.log('   ✓ Password entered');
      }

      // Click sign in button
      await page.click('button:has-text("Sign in")');
      console.log('   ✓ Sign in clicked');

      // Wait for navigation and page load
      console.log('\n3. Waiting for app to load (up to 30 seconds)...');

      // Set up console log listener
      const consoleLogs = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Auth]') || text.includes('[Account]') || text.includes('hobby')) {
          consoleLogs.push(text);
        }
      });

      // Wait for either successful login or timeout
      try {
        await page.waitForSelector('text=/New Chat|Send/', { timeout: 35000 });
      } catch (e) {
        console.log('   Navigation timeout (expected for some cases)');
      }

      await page.waitForTimeout(5000);

      // Check what we have
      console.log('\n4. Checking page state...');

      // Get page text
      const bodyText = await page.textContent('body');

      if (bodyText.includes('HOBBY')) {
        console.log('   ✓ HOBBY plan detected');
      } else if (bodyText.includes('hobby')) {
        console.log('   ✓ hobby plan detected');
      } else {
        console.log('   ? Plan tier not found in visible text');
      }

      if (bodyText.includes('350')) {
        console.log('   ✓ Credit amount 350 detected');
      } else if (bodyText.includes('credit')) {
        console.log('   ✓ Credit text detected');
      } else {
        console.log('   ? Credits not found');
      }

      // Check console logs
      console.log('\n5. Console log messages:');
      if (consoleLogs.length > 0) {
        consoleLogs.slice(0, 10).forEach((log) => {
          console.log('   ' + log);
        });
      } else {
        console.log('   (No relevant logs captured)');
      }

      // Look for chat input
      const chatInput = (await page.$('input[placeholder*="Ask"]')) || (await page.$('textarea'));
      if (chatInput) {
        console.log('\n6. Found chat input, testing message...');
        await chatInput.click();
        await chatInput.type('Test message to verify credits work');
        console.log('   ✓ Message typed');

        // Look for send button - try multiple selectors
        let sendBtn = await page.$('button[aria-label*="Send"]');
        if (!sendBtn) {
          sendBtn = await page.$('button:has-text("Send")');
        }
        if (!sendBtn) {
          const buttons = await page.$$('button');
          for (let btn of buttons) {
            const text = await btn.textContent();
            if (text.includes('Send') || text.includes('send')) {
              sendBtn = btn;
              break;
            }
          }
        }

        if (sendBtn) {
          console.log('   ✓ Send button found');
          await sendBtn.click();
          console.log('   ✓ Message sent!');

          // Wait to see if there are any errors
          await page.waitForTimeout(3000);

          const errorText = await page.textContent('body');
          if (errorText.includes('Insufficient')) {
            console.log('   ✗ ERROR: Insufficient credits error found');
          } else {
            console.log('   ✓ No insufficient credits error');
          }
        } else {
          console.log('   ? Send button not found');
        }
      } else {
        console.log('\n6. Chat input not found - may not be fully loaded');
      }

      // Take screenshot
      console.log('\n7. Taking screenshot...');
      await page.screenshot({ path: '/tmp/test-result.png' });
      console.log('   ✓ Screenshot saved to /tmp/test-result.png');
    } else {
      console.log('   ! Login form not found - checking if already logged in');
      const bodyText = await page.textContent('body');
      console.log('   Page content preview:', bodyText.substring(0, 200));
    }

    console.log('\n========================================');
    console.log('✓ Test completed!');
    console.log('Check /tmp/test-result.png for visual verification');
    console.log('========================================');

    // Keep browser open for 10 more seconds so you can see the result
    await page.waitForTimeout(10000);
    await browser.close();
  } catch (err) {
    console.error('\n✗ Test error:', err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
