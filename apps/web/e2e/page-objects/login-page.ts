import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * LoginPage represents the login page of the application.
 * Provides methods for user authentication interactions.
 */
export class LoginPage extends BasePage {
  // Form elements
  private readonly emailInput = 'input[type="email"], input[name="email"]';
  private readonly passwordInput = 'input[type="password"], input[name="password"]';
  private readonly loginButton = 'button[type="submit"]:has-text("Sign In")';

  // Links
  private readonly forgotPasswordLink = 'a:has-text("Forgot"), a[href*="forgot"]';
  private readonly signupLink = 'a:has-text("Sign Up"), a[href*="signup"]';

  // Messages
  private readonly errorMessage = 'p[class*="text-red"]';
  private readonly successMessage = '[role="status"], .success, [class*="success"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the login page
   */
  override async goto(): Promise<void> {
    await super.goto('/login');
  }

  /**
   * Fill login form with credentials
   * @param email - User email
   * @param password - User password
   */
  async fillLoginForm(email: string, password: string): Promise<void> {
    await this.fill(this.emailInput, email);
    await this.fill(this.passwordInput, password);
  }

  /**
   * Submit the login form
   */
  async submitLogin(): Promise<void> {
    await this.click(this.loginButton);
  }

  /**
   * Perform complete login action
   * @param email - User email
   * @param password - User password
   */
  async login(email: string, password: string): Promise<void> {
    await this.fillLoginForm(email, password);
    await this.submitLogin();
  }

  /**
   * Click the forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.click(this.forgotPasswordLink);
  }

  /**
   * Click the signup link
   */
  async clickSignupLink(): Promise<void> {
    await this.click(this.signupLink);
  }

  /**
   * Check if error message is displayed
   * @returns True if error message is visible
   */
  async hasErrorMessage(): Promise<boolean> {
    return await this.isVisible(this.errorMessage);
  }

  /**
   * Get error message text
   * @returns The error message text or empty string if not visible
   */
  async getErrorMessage(): Promise<string> {
    if (await this.hasErrorMessage()) {
      return await this.getText(this.errorMessage);
    }
    return '';
  }

  /**
   * Check if success message is displayed
   * @returns True if success message is visible
   */
  async hasSuccessMessage(): Promise<boolean> {
    return await this.isVisible(this.successMessage);
  }

  /**
   * Check if login button is disabled
   * @returns True if login button is disabled
   */
  async isLoginButtonDisabled(): Promise<boolean> {
    return await this.isDisabled(this.loginButton);
  }

  /**
   * Wait for login to complete (redirected from login page)
   */
  async waitForLoginSuccess(): Promise<void> {
    // Wait for redirect away from login page
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });
  }
}
