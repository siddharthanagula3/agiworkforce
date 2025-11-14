import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { createErrorHandler } from '../utils/error-handler';

export class ChatPage extends BasePage {
  // Locators
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly newChatButton: Locator;
  readonly conversationList: Locator;
  readonly messageList: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();
    this.sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    this.newChatButton = page
      .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
      .first();
    this.conversationList = page
      .locator('[data-testid="conversation-list"], .conversation-list')
      .first();
    this.messageList = page.locator('[data-testid="message-list"], .message-list').first();
    this.searchInput = page
      .locator('input[placeholder*="Search"], [data-testid="search-conversations"]')
      .first();
  }

  async sendMessage(message: string) {
    await this.chatInput.waitFor({ state: 'visible' });
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  async createNewConversation() {
    if (await this.newChatButton.isVisible()) {
      await this.newChatButton.click();
    }
  }

  async waitForResponse(timeout: number = 30000) {
    await this.page.locator('[data-role="assistant"]').last().waitFor({ timeout });
  }

  async getLastMessage(): Promise<string> {
    const lastMessage = this.page.locator('[data-testid="message-item"]').last();
    return (await lastMessage.textContent()) || '';
  }

  async getMessageCount(): Promise<number> {
    return await this.page.locator('[data-testid="message-item"]').count();
  }

  async searchConversations(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  async deleteConversation(index: number = 0) {
    const errorHandler = createErrorHandler(this.page);
    const conversation = this.page.locator('[data-testid="conversation-item"]').nth(index);
    const deleteButton = conversation
      .locator('button[aria-label*="Delete"], [data-testid="delete-conversation"]')
      .first();

    if (await errorHandler.isElementVisible(deleteButton)) {
      await errorHandler.safeClick(deleteButton);

      // Handle confirmation dialog
      const confirmButton = this.page
        .locator('button:has-text("Delete"), button:has-text("Confirm")')
        .first();
      await errorHandler.handleOptionalDialog(confirmButton, 2000);
    }
  }

  async pinConversation(index: number = 0) {
    const errorHandler = createErrorHandler(this.page);
    const conversation = this.page.locator('[data-testid="conversation-item"]').nth(index);
    const pinButton = conversation
      .locator('button[aria-label*="Pin"], [data-testid="pin-conversation"]')
      .first();

    if (await errorHandler.isElementVisible(pinButton)) {
      await errorHandler.safeClick(pinButton);
    }
  }

  async isStreamingActive(): Promise<boolean> {
    const errorHandler = createErrorHandler(this.page);
    const streamingIndicator = this.page.locator('[data-streaming="true"], .streaming').first();
    return await errorHandler.isElementVisible(streamingIndicator, 1000);
  }

  async waitForStreamingComplete(timeout: number = 30000) {
    const streamingIndicator = this.page.locator('[data-streaming="true"], .streaming').first();
    await streamingIndicator.waitFor({ state: 'hidden', timeout });
  }
}
