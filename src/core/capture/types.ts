import { NormalizedConversation, NormalizedMessage, ProviderId } from '../models/conversation.ts';

export type CaptureCompletenessState = 'COMPLETE' | 'RECOVERING' | 'PARTIAL' | 'UNKNOWN';

export type CaptureProgress = {
  status: CaptureCompletenessState;
  messagesCaptured: number;
  totalEstimated?: number;
  currentStepDescription?: string;
};

export type ProgressCallback = (progress: CaptureProgress) => void;

export type CaptureResult = {
  conversation: NormalizedConversation;
  completenessState: CaptureCompletenessState;
  isComplete: boolean;
  totalCaptured: number;
  totalEstimated?: number;
  warning?: string;
  capturedWindowsCount: number;
};

export type CaptureOptions = {
  maxScrollAttempts?: number;
  scrollDelayMs?: number;
  topReconciliationTimeoutMs?: number;
  onProgress?: ProgressCallback;
  skipIncompleteCheck?: boolean;
};

export interface ProviderCaptureStrategy {
  readonly providerId: ProviderId;

  /**
   * Captures raw message turn elements currently visible in the DOM.
   */
  captureCurrentVisibleMessages(doc: Document): NormalizedMessage[];

  /**
   * Checks if the start of the conversation has been reached.
   */
  isAtBeginning(doc: Document, messages: NormalizedMessage[]): boolean;

  /**
   * Finds the scrollable container hosting the conversation.
   */
  getScrollContainer(doc: Document): HTMLElement | Window;

  /**
   * Scrolls upward to trigger older message loading.
   */
  scrollUp(container: HTMLElement | Window): Promise<void>;

  /**
   * Waits for DOM mutations or new messages to appear after scrolling based on logical progress.
   */
  waitForNewMessages(
    doc: Document,
    beforeTurnRange: import('./scroll-helper.ts').VisibleTurnRange,
    timeoutMs?: number
  ): Promise<boolean>;
}
