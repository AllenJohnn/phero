import { NormalizedConversation, ProviderId } from '../core/models/conversation.ts';

export type ConversationState = {
  isAvailable: boolean;
  isInConversation: boolean;
  conversationId?: string;
  title?: string;
  messageCount?: number;
  isHistoryFullyLoaded?: boolean;
  isStreaming?: boolean;
};

export type ExtractionOptions = {
  maxTurns?: number;
  skipIncompleteCheck?: boolean;
  scrollDelayMs?: number;

  networkTimeoutMs?: number;
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
  readonly supportedDestinations: ProviderId[];

  
  matches(url: URL): boolean;

  
  detectState(document: Document): Promise<ConversationState>;

  
  extractConversation(document: Document, options?: ExtractionOptions): Promise<ExtractionResult>;

  
  getDestinationUrl(): string;

  
  waitForInputReady(document: Document, timeoutMs?: number): Promise<HTMLElement>;

  
  injectPrompt(document: Document, prompt: string): Promise<InjectionResult>;

  
  startDiagnostics?(document: Document): void;
}
