import { ConversationState } from '../types.ts';

/**
 * Checks if a given URL belongs to Google Gemini.
 */
export function isGeminiUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === 'gemini.google.com' ||
    host.endsWith('.gemini.google.com') ||
    host === 'bard.google.com' ||
    host.endsWith('.bard.google.com')
  );
}

/**
 * Detects the conversation status on the current Gemini page.
 */
export function detectGeminiState(doc: Document): ConversationState {
  const url = new URL(doc.location?.href || 'https://gemini.google.com/app');
  const isMatch = isGeminiUrl(url);

  if (!isMatch) {
    return {
      isAvailable: false,
      isInConversation: false,
    };
  }

  // Extract conversation ID from URL: gemini.google.com/app/<id>
  const pathParts = url.pathname.split('/').filter(Boolean);
  let conversationId: string | undefined;
  if (pathParts[0] === 'app' && pathParts[1] && pathParts[1] !== 'new') {
    conversationId = pathParts[1];
  }

  // Detect conversation turns in DOM — prefer top-level turn containers
  const genericTurns = doc.querySelectorAll(
    'div[data-test-id="conversation-turn"], conversation-turn'
  );

  let messageCount: number;
  if (genericTurns.length > 0) {
    messageCount = genericTurns.length;
  } else {
    // Fallback: count individual user/assistant elements
    const userTurns = doc.querySelectorAll(
      'user-query, .user-query-container, div[data-test-id="user-query"]'
    );
    const assistantTurns = doc.querySelectorAll(
      'model-response, .response-container, div[data-test-id="model-response"]'
    );
    messageCount = userTurns.length + assistantTurns.length;
  }

  const isInConversation = messageCount > 0 || (!!conversationId && conversationId !== 'app');

  // Extract conversation title
  let title = '';
  const titleEl = doc.querySelector<HTMLElement>(
    'div[data-test-id="conversation-title"], .conversation-title, h1.title, .chat-title'
  );
  if (titleEl && titleEl.textContent?.trim()) {
    title = titleEl.textContent.trim();
  }

  if (!title && doc.title) {
    title = doc.title
      .replace(/\s*[-–—|]\s*Gemini\s*$/i, '')
      .replace(/^Gemini\s*[-–—|]\s*/i, '')
      .trim();
  }

  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'Gemini Conversation',
    messageCount,
    isHistoryFullyLoaded: true,
  };
}
