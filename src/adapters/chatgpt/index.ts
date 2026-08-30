import { AIProviderAdapter, ConversationState, ExtractionOptions, ExtractionResult, InjectionResult } from '../types.ts';
import { ProviderId } from '../../core/models/conversation.ts';
import { isChatGPTUrl, detectChatGPTState } from './detector.ts';
import { extractChatGPTConversation } from './extractor.ts';
import { waitForChatGPTInput, injectChatGPT } from './injector.ts';

export class ChatGPTAdapter implements AIProviderAdapter {
  public readonly id = 'chatgpt' as const;
  public readonly name = 'ChatGPT';
  public readonly brandColor = '#10A37F';
  public readonly hostnames = ['chatgpt.com', 'chat.openai.com'];
  public readonly supportedDestinations: ProviderId[] = ['claude', 'gemini'];

  public matches(url: URL): boolean {
    return isChatGPTUrl(url);
  }

  public async detectState(doc: Document): Promise<ConversationState> {
    return detectChatGPTState(doc);
  }

  public async extractConversation(
    doc: Document,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    return extractChatGPTConversation(doc, options);
  }

  public getDestinationUrl(): string {
    return 'https://chatgpt.com/';
  }

  public async waitForInputReady(doc: Document, timeoutMs?: number): Promise<HTMLElement> {
    return waitForChatGPTInput(doc, timeoutMs);
  }

  public async injectPrompt(doc: Document, prompt: string): Promise<InjectionResult> {
    return injectChatGPT(doc, prompt);
  }
}
