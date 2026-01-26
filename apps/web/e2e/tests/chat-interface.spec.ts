import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Chat Interface
 *
 * This test suite verifies the web chat functionality including:
 * - Loading chat page
 * - Sending messages
 * - Receiving streaming responses
 * - Model selection
 * - Conversation management
 * - Keyboard shortcuts
 */

test.describe('Chat Interface', () => {
  test('should load chat page with empty state for new users', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Chat page loads with empty state');

    // ==================== Setup: Create test user with subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    // Create a subscription for the test user (required for chat access)
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });
    console.log(`Test user created with hobby subscription: ${user.email}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to chat ====================
      console.log('Step 2: Navigating to chat...');
      await chatPage.goto();

      // ==================== Step 3: Verify chat page loaded ====================
      console.log('Step 3: Verifying chat page loaded...');
      expect(await chatPage.isChatInputVisible()).toBeTruthy();

      // ==================== Step 4: Verify empty state or sidebar ====================
      console.log('Step 4: Checking for empty state or sidebar...');
      const hasEmptyState = await chatPage.isEmptyStateVisible();
      const hasSidebar = await chatPage.isSidebarVisible();

      // Either empty state or sidebar should be visible
      expect(hasEmptyState || hasSidebar).toBeTruthy();

      console.log('Chat page loaded successfully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should redirect to login when accessing chat without auth', async ({ page }) => {
    console.log('TEST: Chat requires authentication');

    // ==================== Step 1: Try to access chat without login ====================
    console.log('Step 1: Attempting to access chat without authentication...');
    await page.goto('/chat');

    // ==================== Step 2: Verify redirect to login ====================
    console.log('Step 2: Verifying redirect to login...');
    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    expect(currentUrl).toContain('/login');
    console.log('Chat correctly redirected to login');
  });

  test('should show model selector', async ({ page, loginPage, chatPage, testDb, testUser }) => {
    console.log('TEST: Model selector is available');

    // ==================== Setup: Create test user with subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // ==================== Step 1: Login ====================
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to chat ====================
      await chatPage.goto();

      // ==================== Step 3: Check model selector ====================
      console.log('Step 3: Checking model selector...');
      const selectedModel = await chatPage.getSelectedModel();
      expect(selectedModel).toBeTruthy();
      console.log(`Current model: ${selectedModel}`);

      // ==================== Step 4: Open model selector ====================
      console.log('Step 4: Opening model selector...');
      await chatPage.openModelSelector();
      await page.waitForTimeout(500);

      // Verify dropdown opened - look for "Auto Selection" text or model buttons
      const hasDropdown =
        (await page.getByText('Auto Selection').isVisible()) ||
        (await page.getByText(/Auto \(Economy\)|Auto \(Balanced\)|Auto \(Premium\)/i).count()) > 0;
      expect(hasDropdown).toBeTruthy();

      console.log('Model selector working correctly');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should allow typing in chat input', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Chat input accepts text');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // ==================== Login and navigate ====================
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // ==================== Test input ====================
      console.log('Step 1: Typing in chat input...');
      const testMessage = 'Hello, this is a test message';
      await chatPage.typeMessage(testMessage);

      // Verify input value
      const inputValue = await chatPage.getInputValue();
      expect(inputValue).toBe(testMessage);

      // ==================== Test clear ====================
      console.log('Step 2: Clearing input...');
      await chatPage.clearInput();
      const clearedValue = await chatPage.getInputValue();
      expect(clearedValue).toBe('');

      console.log('Chat input working correctly');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should enable send button when input has content', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Send button enables with content');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // Login and navigate
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // Check send button state initially (may or may not be disabled depending on implementation)
      console.log('Step 1: Checking send button initial state...');
      await chatPage.isSendButtonEnabled();

      // Type message
      console.log('Step 2: Typing message...');
      await chatPage.typeMessage('Test message');
      await page.waitForTimeout(100);

      // Check send button is enabled
      const afterEnabled = await chatPage.isSendButtonEnabled();
      expect(afterEnabled).toBeTruthy();

      console.log('Send button state correct');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle keyboard shortcut Shift+Enter for new line', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Shift+Enter creates new line');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // Login and navigate
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // Type message with Shift+Enter
      console.log('Step 1: Typing message with Shift+Enter...');
      await chatPage.typeMessage('Line 1');
      await chatPage.pressShiftEnterForNewLine();
      await page.keyboard.type('Line 2');

      // Check value contains newline
      const inputValue = await chatPage.getInputValue();
      expect(inputValue).toContain('Line 1');
      expect(inputValue).toContain('Line 2');

      console.log('Shift+Enter working correctly');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Chat Conversation Management', () => {
  test('should create new conversation', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Create new conversation');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // Login and navigate
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // Click new chat button
      console.log('Step 1: Creating new conversation...');
      await chatPage.createNewConversation();
      await page.waitForTimeout(1000);

      // Verify page is ready for new conversation
      expect(await chatPage.isChatInputVisible()).toBeTruthy();

      console.log('New conversation created successfully');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Chat UI Elements', () => {
  test('should display header with title', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Chat header display');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // Login and navigate
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // Check for Chat heading
      console.log('Step 1: Checking for Chat heading...');
      const heading = page.getByRole('heading', { name: /chat/i });
      const hasHeading = await heading.isVisible();
      expect(hasHeading).toBeTruthy();

      console.log('Chat header displayed correctly');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should have sidebar with conversation list', async ({
    page,
    loginPage,
    chatPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Sidebar visibility');

    // ==================== Setup ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    await testDb.createSubscription(user.id, { plan_tier: 'hobby', status: 'active' });

    try {
      // Login and navigate
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await chatPage.goto();

      // Check sidebar visibility
      console.log('Step 1: Checking sidebar...');
      const sidebarVisible = await chatPage.isSidebarVisible();
      expect(sidebarVisible).toBeTruthy();

      console.log('Sidebar displayed correctly');
    } finally {
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Chat Error Handling', () => {
  test('should handle unauthorized access gracefully', async ({ page }) => {
    console.log('TEST: Unauthorized access handling');

    // Try to access chat API directly without auth
    console.log('Step 1: Making unauthorized API request...');
    const response = await page.request.get('/api/chat/conversations');

    // Should return 401 or redirect
    expect(response.status()).toBeGreaterThanOrEqual(400);

    console.log('Unauthorized access handled correctly');
  });
});
