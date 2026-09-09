import { isClaudeUrl, detectClaudeState } from './detector.js';
import { extractClaudeConversation } from './extractor.js';
import { waitForClaudeInput, injectClaude } from './injector.js';
export class ClaudeAdapter {
  id = 'claude';
  name = 'Claude';
  brandColor = '#D97706';
  hostnames = ['claude.ai'];
  supportedDestinations = ['chatgpt', 'gemini'];
  matches(url) {
    return isClaudeUrl(url);
  }
  async detectState(doc) {
    return detectClaudeState(doc);
  }
  async extractConversation(doc, options) {
    return extractClaudeConversation(doc, options);
  }
  getDestinationUrl() {
    return 'https://claude.ai/new';
  }
  async waitForInputReady(doc, timeoutMs) {
    return waitForClaudeInput(doc, timeoutMs);
  }
  async injectPrompt(doc, prompt) {
    return injectClaude(doc, prompt);
  }
}