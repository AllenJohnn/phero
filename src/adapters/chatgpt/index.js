import { isChatGPTUrl, detectChatGPTState } from './detector.js';
import { extractChatGPTConversation } from './extractor.js';
import { waitForChatGPTInput, injectChatGPT } from './injector.js';
import { startManualScrollDiagnostics } from './diagnostics.js';
import { installNetworkCaptureListener } from './network-capture.js';
if (typeof window !== 'undefined') {
  window.__PHERO_START_DIAGNOSTICS__ = () => {
    startManualScrollDiagnostics(document);
  };
}
export class ChatGPTAdapter {
  id = 'chatgpt';
  name = 'ChatGPT';
  brandColor = '#10A37F';
  hostnames = ['chatgpt.com', 'chat.openai.com'];
  supportedDestinations = ['claude', 'gemini'];
  matches(url) {
    return isChatGPTUrl(url);
  }
  async detectState(doc) {
    return detectChatGPTState(doc);
  }
  async extractConversation(doc, options) {
    return extractChatGPTConversation(doc, options);
  }
  getDestinationUrl() {
    return 'https://chatgpt.com/';
  }
  async waitForInputReady(doc, timeoutMs) {
    return waitForChatGPTInput(doc, timeoutMs);
  }
  async injectPrompt(doc, prompt) {
    return injectChatGPT(doc, prompt);
  }
  startDiagnostics(doc) {
    installNetworkCaptureListener(doc);
    startManualScrollDiagnostics(doc);
  }
}