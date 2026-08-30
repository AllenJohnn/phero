import {
  AIProviderAdapter,
  ConversationState,
  ExtractionOptions,
  ExtractionResult,
  InjectionResult,
} from '../types.ts';
import { isGeminiUrl, detectGeminiState } from './detector.ts';
import { extractGeminiConversation } from './extractor.ts';
import { waitForGeminiInput, injectGemini } from './injector.ts';

export class GeminiAdapter implements AIProviderAdapter {
  public readonly id = 'gemini' as const;
  public readonly name = 'Gemini';
  public readonly brandColor = '#1A73E8';
  public readonly hostnames = ['gemini.google.com', 'bard.google.com'];

  public matches(url: URL): boolean {
    return isGeminiUrl(url);
  }

  public async detectState(doc: Document): Promise<ConversationState> {
    return detectGeminiState(doc);
  }

  public async extractConversation(
    doc: Document,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    return extractGeminiConversation(doc, options);
  }

  public getDestinationUrl(): string {
    return 'https://gemini.google.com/app';
  }

  public async waitForInputReady(doc: Document, timeoutMs?: number): Promise<HTMLElement> {
    return waitForGeminiInput(doc, timeoutMs);
  }

  public async injectPrompt(doc: Document, prompt: string): Promise<InjectionResult> {
    return injectGemini(doc, prompt);
  }
}
