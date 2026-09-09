import { isGeminiUrl, detectGeminiState } from './detector.js';
import { extractGeminiConversation } from './extractor.js';
import { waitForGeminiInput, injectGemini } from './injector.js';
export class GeminiAdapter {
  id = 'gemini';
  name = 'Gemini';
  brandColor = '#1A73E8';
  hostnames = ['gemini.google.com', 'bard.google.com'];
  supportedDestinations = ['chatgpt', 'claude'];
  matches(url) {
    return isGeminiUrl(url);
  }
  async detectState(doc) {
    return detectGeminiState(doc);
  }
  async extractConversation(doc, options) {
    return extractGeminiConversation(doc, options);
  }
  getDestinationUrl() {
    return 'https://gemini.google.com/app';
  }
  async waitForInputReady(doc, timeoutMs) {
    return waitForGeminiInput(doc, timeoutMs);
  }
  async injectPrompt(doc, prompt) {
    return injectGemini(doc, prompt);
  }
}