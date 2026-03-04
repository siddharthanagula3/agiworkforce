import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * SignupPage represents the signup page of the application.
 * It extends BasePage and provides methods specific to signup functionality.
 */
export class SignupPage extends BasePage {
  // Selectors
  private readonly fullNameInput = 'input[placeholder="Full name"]';
  private readonly emailInput = 'input[placeholder="Email address"]';
  private readonly passwordInput = 'input[placeholder="Password"]';
  private readonly confirmPasswordInput = 'input[placeholder="Confirm Password"]';
  private readonly submitButton = 'button[type="submit"]';
  private readonly errorMessage = 'div[class*="text-red-500"], div[class*="text-amber-500"]';
  private readonly githubButton = 'button:has-text("GitHub")';
  private readonly googleButton = 'button:has-text("Google")';
  private readonly loginLink = 'a:has-text("Sign in")';
  private readonly passwordRequirements =
    'div[class*="text-green-500"], div[class*="text-amber-500"]';
  private readonly checkEmailMessage = 'h2:has-text("Check your email")';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the signup page
   */
  override async goto(): Promise<void> {
    await super.goto('/signup');
  }

  /**
   * Fill in the signup form with email, password, and display name
   * @param email - The email address
   * @param password - The password
   * @param displayName - The full name/display name
   */
  async fillSignupForm(email: string, password: string, displayName: string): Promise<void> {
    await this.fill(this.fullNameInput, displayName);
    await this.fill(this.emailInput, email);
    await this.fill(this.passwordInput, password);
    await this.fill(this.confirmPasswordInput, password);
  }

  /**
   * Fill only the full name input
   * @param name - The full name
   */
  async fillFullName(name: string): Promise<void> {
    await this.fill(this.fullNameInput, name);
  }

  /**
   * Fill only the email input
   * @param email - The email address
   */
  async fillEmail(email: string): Promise<void> {
    await this.fill(this.emailInput, email);
  }

  /**
   * Fill only the password input
   * @param password - The password
   */
  async fillPassword(password: string): Promise<void> {
    await this.fill(this.passwordInput, password);
  }

  /**
   * Fill only the confirm password input
   * @param password - The password
   */
  async fillConfirmPassword(password: string): Promise<void> {
    await this.fill(this.confirmPasswordInput, password);
  }

  /**
   * Submit the signup form
   */
  async submitSignup(): Promise<void> {
    await this.click(this.submitButton);
  }

  /**
   * Get error message displayed on the form
   * @returns The error message text
   */
  async getErrorMessage(): Promise<string | null> {
    const isVisible = await this.isVisible(this.errorMessage);
    if (isVisible) {
      return await this.getText(this.errorMessage);
    }
    return null;
  }

  /**
   * Check if error message is displayed
   * @returns True if error message is visible
   */
  async hasErrorMessage(): Promise<boolean> {
    return await this.isVisible(this.errorMessage);
  }

  /**
   * Check if signup was successful (check email message displayed)
   * @returns True if the "Check your email" message is visible
   */
  async isSignupSuccessful(): Promise<boolean> {
    return await this.isVisible(this.checkEmailMessage);
  }

  /**
   * Click the GitHub signup button
   */
  async clickGithubButton(): Promise<void> {
    await this.click(this.githubButton);
  }

  /**
   * Click the Google signup button
   */
  async clickGoogleButton(): Promise<void> {
    await this.click(this.googleButton);
  }

  /**
   * Click the sign in link at the bottom
   */
  async clickSignInLink(): Promise<void> {
    await this.click(this.loginLink);
  }

  /**
   * Check if submit button is disabled
   * @returns True if the button is disabled
   */
  async isSubmitButtonDisabled(): Promise<boolean> {
    return await this.isDisabled(this.submitButton);
  }

  /**
   * Check if password requirements are visible
   * @returns True if password requirements text is visible
   */
  async isPasswordRequirementsVisible(): Promise<boolean> {
    return await this.isVisible(this.passwordRequirements);
  }

  /**
   * Get password requirements text
   * @returns The password requirements text
   */
  async getPasswordRequirementsText(): Promise<string> {
    return await this.getText(this.passwordRequirements);
  }
}
