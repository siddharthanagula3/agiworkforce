import { Page, Locator } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * ChatPage is a page object for the Chat interface.
 * It provides methods for interacting with the chat UI.
 */
export class ChatPage extends BasePage {
  // Locators
  private readonly chatInput: Locator;
  private readonly sendButton: Locator;
  private readonly stopButton: Locator;
  // private readonly messageList: Locator;
  private readonly userMessages: Locator;
  private readonly assistantMessages: Locator;
  private readonly modelSelector: Locator;
  private readonly sidebarToggle: Locator;
  private readonly conversationList: Locator;
  private readonly newChatButton: Locator;
  private readonly loadingIndicator: Locator;
  private readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);

    // Input area - use placeholder text to target the correct textarea
    this.chatInput = page.getByPlaceholder(
      /start a new conversation|continue the conversation|type a message|send a message/i,
    );
    this.sendButton = page.getByRole('button', { name: /send/i });
    this.stopButton = page.getByRole('button', { name: /stop/i });

    // Message display
    this.userMessages = page.locator('[data-message-role="user"], .message-user');
    this.assistantMessages = page.locator('[data-message-role="assistant"], .message-assistant');
    this.loadingIndicator = page.locator('[data-testid="thinking-indicator"], .animate-pulse');

    // Header
    this.modelSelector = page.getByRole('button', { name: /model|auto/i }).first();

    // Sidebar
    this.sidebarToggle = page.getByRole('button', { name: /menu|sidebar|collapse/i });
    // Look for the sidebar container - the div with w-64/w-72 class that contains "Conversations" heading
    this.conversationList = page
      .locator('div.w-64, div.w-72')
      .filter({ hasText: 'Conversations' })
      .first();
    this.newChatButton = page
      .getByRole('button', { name: /new conversation/i })
      .or(page.locator('button[title="New conversation"]'));

    // Empty state - look for the welcome text
    this.emptyState = page.getByText('How can I help you today?');
  }

  /**
   * Navigate to the chat page
   */
  override async goto(): Promise<void> {
    await super.goto('/chat');
    await this.waitForLoad();
  }

  /**
   * Wait for the chat page to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    // Wait for either empty state or chat input to be visible
    await Promise.race([
      this.chatInput.waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Type a message in the chat input
   */
  async typeMessage(message: string): Promise<void> {
    await this.chatInput.fill(message);
  }

  /**
   * Send a message
   */
  async sendMessage(message: string): Promise<void> {
    await this.typeMessage(message);
    await this.sendButton.click();
  }

  /**
   * Wait for the assistant to start responding
   */
  async waitForStreamingStart(timeout = 10000): Promise<void> {
    await this.loadingIndicator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the assistant to finish responding
   */
  async waitForStreamingEnd(timeout = 60000): Promise<void> {
    // Wait for either:
    // 1. Loading indicator to disappear
    // 2. Stop button to disappear
    await Promise.race([
      this.loadingIndicator.waitFor({ state: 'hidden', timeout }),
      this.stopButton.waitFor({ state: 'hidden', timeout }),
    ]);
    // Small delay to ensure content has settled
    await this.page.waitForTimeout(500);
  }

  /**
   * Stop message generation
   */
  async stopGeneration(): Promise<void> {
    if (await this.stopButton.isVisible()) {
      await this.stopButton.click();
    }
  }

  /**
   * Get the number of user messages
   */
  async getUserMessageCount(): Promise<number> {
    return await this.userMessages.count();
  }

  /**
   * Get the number of assistant messages
   */
  async getAssistantMessageCount(): Promise<number> {
    return await this.assistantMessages.count();
  }

  /**
   * Get the text of the last assistant message
   */
  async getLastAssistantMessage(): Promise<string> {
    const messages = await this.assistantMessages.all();
    if (messages.length === 0) return '';
    const lastMessage = messages[messages.length - 1]!;
    return (await lastMessage.textContent()) || '';
  }

  /**
   * Check if the chat input is visible
   */
  async isChatInputVisible(): Promise<boolean> {
    return await this.chatInput.isVisible();
  }

  /**
   * Check if send button is enabled
   */
  async isSendButtonEnabled(): Promise<boolean> {
    return !(await this.sendButton.isDisabled());
  }

  /**
   * Check if stop button is visible (streaming in progress)
   */
  async isStreaming(): Promise<boolean> {
    return await this.stopButton.isVisible();
  }

  /**
   * Check if empty state is visible
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Click a suggestion from the empty state
   */
  async clickSuggestion(index: number): Promise<void> {
    const suggestions = this.page.locator(
      '[data-testid="suggestion-button"], button[class*="suggestion"]',
    );
    const suggestion = suggestions.nth(index);
    if (await suggestion.isVisible()) {
      await suggestion.click();
    }
  }

  /**
   * Open the model selector
   */
  async openModelSelector(): Promise<void> {
    await this.modelSelector.click();
  }

  /**
   * Select a model from the dropdown
   */
  async selectModel(modelName: string): Promise<void> {
    await this.openModelSelector();
    const modelOption = this.page.getByRole('option', { name: new RegExp(modelName, 'i') });
    await modelOption.click();
  }

  /**
   * Get the currently selected model
   */
  async getSelectedModel(): Promise<string> {
    return (await this.modelSelector.textContent()) || '';
  }

  /**
   * Create a new conversation
   */
  async createNewConversation(): Promise<void> {
    await this.newChatButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Get the number of conversations in the sidebar
   */
  async getConversationCount(): Promise<number> {
    const conversations = this.page.locator(
      '[data-testid="conversation-item"], [class*="conversation-item"]',
    );
    return await conversations.count();
  }

  /**
   * Click a conversation in the sidebar by index
   */
  async selectConversation(index: number): Promise<void> {
    const conversations = this.page.locator(
      '[data-testid="conversation-item"], [class*="conversation-item"]',
    );
    await conversations.nth(index).click();
  }

  /**
   * Check if sidebar is visible
   */
  async isSidebarVisible(): Promise<boolean> {
    return await this.conversationList.isVisible();
  }

  /**
   * Toggle the sidebar
   */
  async toggleSidebar(): Promise<void> {
    await this.sidebarToggle.click();
  }

  /**
   * Get the current input value
   */
  async getInputValue(): Promise<string> {
    return await this.chatInput.inputValue();
  }

  /**
   * Clear the input
   */
  async clearInput(): Promise<void> {
    await this.chatInput.clear();
  }

  /**
   * Press Enter to send
   */
  async pressEnterToSend(): Promise<void> {
    await this.chatInput.press('Enter');
  }

  /**
   * Press Shift+Enter for new line
   */
  async pressShiftEnterForNewLine(): Promise<void> {
    await this.chatInput.press('Shift+Enter');
  }
}
