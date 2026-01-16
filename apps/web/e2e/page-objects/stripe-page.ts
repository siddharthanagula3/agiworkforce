import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * StripePage represents the Stripe checkout page.
 * It extends BasePage and provides methods specific to Stripe payment functionality.
 */
export class StripePage extends BasePage {
  // Stripe iframe and elements
  private readonly stripeCardIframe = 'iframe[title="Iframe for secured payment-request form"]';
  private readonly stripeCardNumberIframe = 'iframe[name="__private_iframe"]';

  // Email field
  private readonly emailInput = 'input[type="email"]';

  // Billing details
  private readonly nameInput = 'input[placeholder*="Name"], input[aria-label*="Name"]';
  private readonly addressInput = 'input[placeholder*="Address"], input[aria-label*="Address"]';
  private readonly postalCodeInput = 'input[placeholder*="Postal code"], input[aria-label*="ZIP"]';

  // Submit button
  private readonly submitPaymentButton = 'button[type="submit"]';
  private readonly payButton = 'button:has-text("Pay")';

  // Error messages
  private readonly errorMessage = 'div[class*="error"], div[class*="text-red"]';

  // Checkout page indicators
  private readonly checkoutTitle = 'h1:has-text("Checkout"), div:has-text("Checkout")';
  private readonly priceDisplay = 'div[class*="text-3xl"], div[class*="text-2xl"]';

  // Test card values
  private readonly TEST_CARD_NUMBER = '4242 4242 4242 4242';
  private readonly TEST_CARD_EXPIRY = '12/25';
  private readonly TEST_CARD_CVC = '123';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for the Stripe checkout page to load
   */
  async waitForCheckoutPage(): Promise<void> {
    await this.page.waitForURL(/.*checkout.*/);
    await this.waitForVisible(this.emailInput);
  }

  /**
   * Check if we're on a payment page (either Stripe or internal checkout)
   * @returns True if payment page elements are visible
   */
  async isOnPaymentPage(): Promise<boolean> {
    // Check for email input which appears on checkout pages
    return await this.isVisible(this.emailInput);
  }

  /**
   * Fill the email field on the checkout page
   * @param email - The email address
   */
  async fillEmail(email: string): Promise<void> {
    const emailField = this.page.locator(this.emailInput).first();
    await emailField.fill(email);
  }

  /**
   * Fill billing details
   * @param email - The email address
   * @param name - The full name
   * @param postalCode - The postal code
   */
  async fillBillingDetails(email: string, name?: string, postalCode?: string): Promise<void> {
    // Fill email
    await this.fillEmail(email);

    // Fill name if provided
    if (name) {
      const nameField = this.page.locator(this.nameInput).first();
      if (await nameField.isVisible()) {
        await nameField.fill(name);
      }
    }

    // Fill postal code if provided
    if (postalCode) {
      const postalField = this.page.locator(this.postalCodeInput).first();
      if (await postalField.isVisible()) {
        await postalField.fill(postalCode);
      }
    }
  }

  /**
   * Fill test card details by entering the card number directly
   * This method attempts to fill the card field directly (not recommended for production)
   * For real Stripe checkout, the card is entered in an iframe
   */
  async fillTestCard(): Promise<void> {
    // Look for card number input field
    const cardNumberInput = this.page
      .locator('input[placeholder*="Card"], input[placeholder*="card"]')
      .first();

    if (await cardNumberInput.isVisible()) {
      await cardNumberInput.fill(this.TEST_CARD_NUMBER);

      // Look for expiry field
      const expiryInput = this.page
        .locator('input[placeholder*="MM / YY"], input[placeholder*="Expiry"]')
        .first();
      if (await expiryInput.isVisible()) {
        await expiryInput.fill(this.TEST_CARD_EXPIRY);
      }

      // Look for CVC field
      const cvcInput = this.page
        .locator('input[placeholder*="CVC"], input[placeholder*="Security code"]')
        .first();
      if (await cvcInput.isVisible()) {
        await cvcInput.fill(this.TEST_CARD_CVC);
      }
    }
  }

  /**
   * Fill card details using iframe (Stripe Elements or Checkout)
   * This is a helper method for when Stripe uses iframes
   */
  async fillTestCardViaIframe(): Promise<void> {
    try {
      // Try first iframe
      let stripeFrame = this.page.frameLocator(this.stripeCardIframe);
      let cardInput = stripeFrame.locator('input[placeholder*="1234"]').first();

      // If not found, try second iframe
      const isVisible = await cardInput.isVisible({ timeout: 2000 }).catch(() => false);
      if (!isVisible) {
        stripeFrame = this.page.frameLocator(this.stripeCardNumberIframe);
        cardInput = stripeFrame.locator('input[placeholder*="1234"]').first();
      }

      // Fill card details
      if (await cardInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cardInput.fill(this.TEST_CARD_NUMBER);
        await this.page.waitForTimeout(500);

        const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').first();
        if (await expiryInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expiryInput.fill(this.TEST_CARD_EXPIRY);
          await this.page.waitForTimeout(500);
        }

        const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').first();
        if (await cvcInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cvcInput.fill(this.TEST_CARD_CVC);
          await this.page.waitForTimeout(500);
        }
      }
    } catch {
      console.log('Could not fill card via iframe, trying direct fill');
      await this.fillTestCard();
    }
  }

  /**
   * Submit the payment form
   */
  async submitPayment(): Promise<void> {
    // Try to find submit button with various text patterns
    const submitButton = this.page
      .locator(this.submitPaymentButton)
      .or(this.page.locator(this.payButton))
      .first();

    if (await submitButton.isVisible()) {
      await submitButton.click();
    }
  }

  /**
   * Check if error message is displayed
   * @returns True if error message is visible
   */
  async hasError(): Promise<boolean> {
    return await this.isVisible(this.errorMessage);
  }

  /**
   * Get error message text
   * @returns The error message text
   */
  async getErrorText(): Promise<string> {
    return await this.getText(this.errorMessage);
  }

  /**
   * Check if checkout page is visible
   * @returns True if checkout page indicators are visible
   */
  async isCheckoutPageVisible(): Promise<boolean> {
    return (await this.isVisible(this.checkoutTitle)) || (await this.isVisible(this.emailInput));
  }

  /**
   * Get the price being displayed on the payment page
   * @returns The price as a string
   */
  async getDisplayedPrice(): Promise<string> {
    return await this.getText(this.priceDisplay);
  }

  /**
   * Wait for payment success (redirect to success page)
   */
  async waitForPaymentSuccess(): Promise<void> {
    await this.page.waitForURL(/.*success|.*dashboard|.*confirm.*/, { timeout: 30000 });
  }

  /**
   * Wait for payment failure
   */
  async waitForPaymentFailure(): Promise<void> {
    await this.page.waitForURL(/.*failure|.*error|.*cancel.*/, { timeout: 30000 });
  }

  /**
   * Check if we're redirected back to pricing after payment
   * @returns True if on pricing page
   */
  async isRedirectedToPricing(): Promise<boolean> {
    return await this.page.url().includes('/pricing');
  }

  /**
   * Check if we're redirected to dashboard after payment
   * @returns True if on dashboard
   */
  async isRedirectedToDashboard(): Promise<boolean> {
    return await this.page.url().includes('/dashboard');
  }

  /**
   * Get the current page URL
   * @returns The current URL
   */
  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }
}
