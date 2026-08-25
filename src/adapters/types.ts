import { NormalizedConversation, ProviderId } from '../core/models/conversation.ts';

export type ConversationState = {
  isAvailable: boolean;
  isInConversation: boolean;
  conversationId?: string;
  title?: string;
  messageCount?: number;
  isHistoryFullyLoaded?: boolean;
};

export type ExtractionOptions = {
  maxTurns?: number;
  skipIncompleteCheck?: boolean;
};

export type ExtractionResult = {
  conversation: NormalizedConversation;
  isComplete: boolean;
  warning?: string;
  totalTurnsDetected: number;
};

export type InjectionResult = {
  success: boolean;
  verified: boolean;
  error?: string;
  composerElement?: HTMLElement | null;
};

export interface AIProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  readonly brandColor: string;
  readonly hostnames: string[];

  /**
   * Checks if current URL belongs to this provider.
   */
  matches(url: URL): boolean;

  /**
   * Detects the conversation status on the current page.
   */
  detectState(document: Document): Promise<ConversationState>;

  /**
   * Extracts the conversation content from the active document.
   */
  extractConversation(document: Document, options?: ExtractionOptions): Promise<ExtractionResult>;

  /**
   * Gets the URL to open a new conversation at this provider.
   */
  getDestinationUrl(): string;

  /**
   * Waits for the composer input field to be ready for injection.
   */
  waitForInputReady(document: Document, timeoutMs?: number): Promise<HTMLElement>;

  /**
   * Injects the continuation prompt into the composer and verifies injection.
   */
  injectPrompt(document: Document, prompt: string): Promise<InjectionResult>;
}
