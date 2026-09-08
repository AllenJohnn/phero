import { ConversationState } from '../types.ts';


export function isGeminiUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === 'gemini.google.com' ||
    host.endsWith('.gemini.google.com') ||
    host === 'bard.google.com' ||
    host.endsWith('.bard.google.com')
  );
}


export function detectGeminiState(doc: Document): ConversationState {
  const url = new URL(doc.location?.href || 'https://gemini.google.com/app');
  const isMatch = isGeminiUrl(url);

  if (!isMatch) {
    return {
      isAvailable: false,
      isInConversation: false,
    };
  }

  
  const pathParts = url.pathname.split('/').filter(Boolean);
  let conversationId: string | undefined;
  if (pathParts[0] === 'app' && pathParts[1] && pathParts[1] !== 'new') {
    conversationId = pathParts[1];
  }

  
  const genericTurns = doc.querySelectorAll(
    'div[data-test-id="conversation-turn"], conversation-turn'
  );

  let messageCount: number;
  if (genericTurns.length > 0) {
    messageCount = genericTurns.length;
  } else {
    
    const userTurns = doc.querySelectorAll(
      'user-query, .user-query-container, div[data-test-id="user-query"]'
    );
    const assistantTurns = doc.querySelectorAll(
      'model-response, .response-container, div[data-test-id="model-response"]'
    );
    messageCount = userTurns.length + assistantTurns.length;
  }

  const isInConversation = messageCount > 0 || (!!conversationId && conversationId !== 'app');

  
  let title = '';
  if (conversationId) {
    const activeSidebarLink = doc.querySelector(`a[href*="${conversationId}"]`);
    if (activeSidebarLink) {
      const titleEl = activeSidebarLink.querySelector('.chat-title, [data-test-id="chat-title"], .title') || activeSidebarLink;
      title = titleEl.textContent?.trim() || '';
    }
  }

  if (!title) {
    const titleEl = doc.querySelector<HTMLElement>(
      'div[data-test-id="conversation-title"], .conversation-title, h1.title, .chat-title'
    );
    if (titleEl && titleEl.textContent?.trim()) {
      title = titleEl.textContent.trim();
    }
  }

  if (!title && doc.title) {
    title = doc.title
      .replace(/\s*[-–—|]\s*Gemini\s*$/i, '')
      .replace(/^Gemini\s*[-–—|]\s*/i, '')
      .trim();
  }

  
  const isStreaming = !!doc.querySelector('button[aria-label="Stop generating"], button[mattooltip="Stop generating"], .stop-button, generating-progress');

  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'Gemini Conversation',
    messageCount,
    isHistoryFullyLoaded: true,
    isStreaming,
  };
}
