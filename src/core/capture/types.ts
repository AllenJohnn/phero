import { NormalizedConversation, NormalizedMessage, ProviderId } from '../models/conversation.ts';

export type CaptureCompletenessState = 'COMPLETE' | 'RECOVERING' | 'PARTIAL' | 'UNKNOWN';
export type CaptureMethod = 'DATA_LEVEL' | 'DOM_VIRTUALIZATION';

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
  captureMethod: CaptureMethod;
  isComplete: boolean;
  totalCaptured: number;
  totalEstimated?: number;
  warning?: string;
  capturedWindowsCount: number;
};

export type CaptureOptions = {
  maxScrollAttempts?: number;
  scrollDelayMs?: number;

  onProgress?: ProgressCallback;
  skipIncompleteCheck?: boolean;
};

export interface ProviderCaptureStrategy {
  readonly providerId: ProviderId;

  
  captureCurrentVisibleMessages(doc: Document): NormalizedMessage[];

  
  isAtBeginning(doc: Document, messages: NormalizedMessage[]): boolean;

  
  getScrollContainer(doc: Document): HTMLElement | Window;

  
  scrollUp(container: HTMLElement | Window): Promise<void>;

  
  waitForNewMessages(
    doc: Document,
    beforeTurnRange: import('./scroll-helper.ts').VisibleTurnRange,
    timeoutMs?: number
  ): Promise<boolean>;
}
