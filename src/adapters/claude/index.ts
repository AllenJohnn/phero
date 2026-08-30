import {
  AIProviderAdapter,
  ConversationState,
  ExtractionOptions,
  ExtractionResult,
  InjectionResult,
} from '../types.ts';
import { ProviderId } from '../../core/models/conversation.ts';
import { isClaudeUrl, detectClaudeState } from './detector.ts';
import { extractClaudeConversation } from './extractor.ts';
import { waitForClaudeInput, injectClaude } from './injector.ts';

export class ClaudeAdapter implements AIProviderAdapter {
  public readonly id = 'claude' as const;
  public readonly name = 'Claude';
  public readonly brandColor = '#D97706';
  public readonly hostnames = ['claude.ai'];
  public readonly supportedDestinations: ProviderId[] = ['chatgpt', 'gemini'];

  public matches(url: URL): boolean {
    return isClaudeUrl(url);
  }

  public async detectState(doc: Document): Promise<ConversationState> {
    return detectClaudeState(doc);
  }

  public async extractConversation(
    doc: Document,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    return extractClaudeConversation(doc, options);
  }

  public getDestinationUrl(): string {
    return 'https://claude.ai/new';
  }

  public async waitForInputReady(doc: Document, timeoutMs?: number): Promise<HTMLElement> {
    return waitForClaudeInput(doc, timeoutMs);
  }

  public async injectPrompt(doc: Document, prompt: string): Promise<InjectionResult> {
    return injectClaude(doc, prompt);
  }
}
