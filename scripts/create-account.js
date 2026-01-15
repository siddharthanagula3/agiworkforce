const { chromium } = require('playwright');

// Generate a secure random password
const generatePassword = () => {
  const length = 16;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

(async () => {
  console.log('========================================');
  console.log('Creating New AGI Workforce Account');
  console.log('========================================\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const password = generatePassword();
    const email = 'agiautomationllc@gmail.com';

    console.log('1. Navigating to app...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    console.log('   ✓ Page loaded');

    await page.waitForTimeout(2000);

    // Click "Create account" link
    console.log('\n2. Looking for signup option...');
    const createAccountLink = await page.$('text=/Create account|Sign up/i');
    if (createAccountLink) {
      console.log('   ✓ Found create account link');
      await createAccountLink.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('   ? Create account link not found, looking for signup form');
    }

    // Fill in signup form
    console.log('\n3. Filling signup form...');
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.fill(email);
      console.log('   ✓ Email entered: ' + email);
    }

    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill(password);
      console.log('   ✓ Password set (16 characters)');
    }

    // Look for signup button
    console.log('\n4. Submitting signup form...');
    const signUpBtn =
      (await page.$('button:has-text("Sign up")')) ||
      (await page.$('button:has-text("Create account")')) ||
      (await page.$('button[type="submit"]'));

    if (signUpBtn) {
      await signUpBtn.click();
      console.log('   ✓ Signup button clicked');

      // Wait for account creation
      await page.waitForTimeout(5000);

      console.log('\n5. Checking signup result...');
      const bodyText = await page.textContent('body');

      if (bodyText.includes('New Chat') || bodyText.includes('Welcome')) {
        console.log('   ✓ Account created successfully!');
      } else if (bodyText.includes('error') || bodyText.includes('Error')) {
        console.log('   ✗ Error during signup');
        console.log('   Response:', bodyText.substring(0, 300));
      } else {
        console.log('   ? Status unknown, check browser');
      }
    } else {
      console.log('   ✗ Signup button not found');
    }

    console.log('\n========================================');
    console.log('ACCOUNT CREDENTIALS');
    console.log('========================================');
    console.log('Email:    ' + email);
    console.log('Password: ' + password);
    console.log('========================================\n');
    console.log('✓ Account creation script completed');
    console.log('Next: User upgrades plan to Hobby in dashboard');
    console.log('Then: Tests can be run with this account\n');

    // Save credentials to file
    const fs = require('fs');
    const creds = `# AGI Workforce Test Account Credentials
Email: ${email}
Password: ${password}
Created: ${new Date().toISOString()}
Status: Awaiting Hobby plan upgrade

IMPORTANT: Store this password securely.
Use this account for testing all features.
`;

    fs.writeFileSync('/tmp/test-account-credentials.txt', creds);
    console.log('✓ Credentials saved to /tmp/test-account-credentials.txt');

    await browser.close();
  } catch (err) {
    console.error('\n✗ Error:', err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
