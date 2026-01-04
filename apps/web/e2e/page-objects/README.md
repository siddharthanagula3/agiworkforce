# Page Objects for E2E Tests

This directory contains Playwright page objects for testing the AGI Workforce web application.

## Overview

Page objects are a design pattern used in test automation that encapsulates page elements and interactions into reusable classes. This makes tests more maintainable and readable.

## Structure

### BasePage (`base-page.ts`)

The base class that all page objects inherit from. Provides common methods for web interactions:

- `goto(path)` - Navigate to a specific path
- `click(selector)` - Click an element
- `fill(selector, text)` - Fill an input field
- `getText(selector)` - Get element text
- `isVisible(selector)` - Check if element is visible
- `isDisabled(selector)` - Check if element is disabled
- `getValue(selector)` - Get input value
- `clear(selector)` - Clear an input field
- `waitForSelector(selector)` - Wait for element to be in DOM
- `waitForVisible(selector)` - Wait for element to be visible
- `waitForURL(urlPattern)` - Wait for URL to match pattern
- `exists(selector)` - Check if element exists

### SignupPage (`signup-page.ts`)

Handles interactions with the signup page (`/signup`):

**Key Methods:**

- `fillSignupForm(email, password, displayName)` - Fill the entire signup form
- `fillFullName(name)` - Fill full name field
- `fillEmail(email)` - Fill email field
- `fillPassword(password)` - Fill password field
- `fillConfirmPassword(password)` - Fill confirm password field
- `submitSignup()` - Submit the form
- `getErrorMessage()` - Get error message text
- `hasErrorMessage()` - Check if error is displayed
- `isSignupSuccessful()` - Check if "Check your email" message is shown
- `clickGithubButton()` - Click GitHub signup button
- `clickGoogleButton()` - Click Google signup button
- `isSubmitButtonDisabled()` - Check if submit button is disabled
- `isPasswordRequirementsVisible()` - Check if password requirements are shown
- `getPasswordRequirementsText()` - Get password requirements text

### PricingPage (`pricing-page.ts`)

Handles interactions with the pricing page (`/pricing`):

**Key Methods:**

- `toggleBillingInterval(interval)` - Toggle between monthly and annual billing
- `getBillingInterval()` - Get current billing interval
- `selectPlan(tier)` - Select a plan (hobby, pro, or max)
- `selectHobbyPlan()` - Select hobby plan
- `selectProPlan()` - Select pro plan
- `selectMaxPlan()` - Select max plan
- `getCurrentPlanBadge()` - Get "Current Plan" badge text
- `hasManageButton()` - Check if manage button is visible
- `clickManageButton()` - Click manage subscription button
- `getPlanPrice(tier)` - Get plan price
- `isPlanCardVisible(tier)` - Check if plan card is visible
- `isPlanButtonDisabled(tier)` - Check if plan button is disabled
- `isLaunchOfferBadgeVisible()` - Check if launch offer badge is visible
- `isRecommendedBadgeVisible()` - Check if recommended badge is visible
- `isSubscriptionRequiredMessageVisible()` - Check if subscription required message is shown

### DashboardPage (`dashboard-page.ts`)

Handles interactions with the dashboard page (`/dashboard`):

**Key Methods:**

- `waitForLoad()` - Wait for dashboard to fully load
- `getCurrentPlanTier()` - Get current plan tier (hobby, pro, max, free)
- `getSubscriptionStatus()` - Get subscription status text
- `isSubscriptionActive()` - Check if subscription is active
- `isFreeTier()` - Check if user is on free tier
- `getApiUsageCount()` - Get API usage count
- `getTeamMembersCount()` - Get team members count
- `isPlanTierCardVisible()` - Check if plan tier card is visible
- `isApiUsageCardVisible()` - Check if API usage card is visible
- `isQuickActionsSectionVisible()` - Check if quick actions are visible
- `clickDownloadAppButton()` - Click download app button
- `clickManageBillingButton()` - Click manage billing button
- `isDashboardTitleVisible()` - Check if title is visible

### StripePage (`stripe-page.ts`)

Handles interactions with the Stripe checkout page:

**Key Methods:**

- `waitForCheckoutPage()` - Wait for checkout page to load
- `isOnPaymentPage()` - Check if on payment page
- `fillEmail(email)` - Fill email field
- `fillBillingDetails(email, name, postalCode)` - Fill billing details
- `fillTestCard()` - Fill test card details directly
- `fillTestCardViaIframe()` - Fill test card in Stripe iframe
- `submitPayment()` - Submit payment form
- `hasError()` - Check if error message is displayed
- `getErrorText()` - Get error message text
- `isCheckoutPageVisible()` - Check if checkout page is visible
- `getDisplayedPrice()` - Get displayed price
- `waitForPaymentSuccess()` - Wait for success redirect
- `waitForPaymentFailure()` - Wait for failure redirect
- `isRedirectedToPricing()` - Check if redirected to pricing
- `isRedirectedToDashboard()` - Check if redirected to dashboard
- `getCurrentUrl()` - Get current page URL

**Test Card Details:**

- Card Number: 4242 4242 4242 4242
- Expiry: 12/25
- CVC: 123

## Usage Example

```typescript
import { test, expect } from '@playwright/test';
import { SignupPage, PricingPage, DashboardPage } from '../page-objects';

test('User can sign up and select a plan', async ({ page }) => {
  // Create page objects
  const signupPage = new SignupPage(page);
  const pricingPage = new PricingPage(page);
  const dashboardPage = new DashboardPage(page);

  // Sign up
  await signupPage.goto();
  await signupPage.fillSignupForm('test@example.com', 'Password123!', 'John Doe');
  await signupPage.submitSignup();
  expect(await signupPage.isSignupSuccessful()).toBeTruthy();

  // Go to pricing
  await pricingPage.goto();
  await pricingPage.selectProPlan();

  // Check dashboard
  await dashboardPage.goto();
  const planTier = await dashboardPage.getCurrentPlanTier();
  expect(planTier).toBe('Pro');
});
```

## Best Practices

1. **Use specific selectors**: Prefer ID or data-testid attributes when available
2. **Keep methods simple**: Each method should do one thing
3. **Use meaningful names**: Method names should clearly describe what they do
4. **Avoid test logic in page objects**: Page objects should only handle UI interactions
5. **Chain actions**: Use method chaining for readable test flows
6. **Handle waits**: Always wait for elements to be ready before interacting

## Selector Strategy

Selectors use a combination of approaches:

- **CSS selectors**: For standard HTML elements
- **Playwright locators**: Modern Playwright syntax with `.locator()`
- **Text selectors**: For elements identified by visible text (e.g., `button:has-text("Submit")`)
- **aria-label**: Accessibility-first selectors when available
- **data-testid**: Recommended for complex elements (add to components as needed)

## Future Improvements

- Add more specific selectors with data-testid attributes
- Create helpers for common assertion patterns
- Add visual regression testing page objects
- Add mobile/responsive view page objects
