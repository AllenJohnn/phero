import { ConversationState } from '../types.ts';

export function isClaudeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'claude.ai' || host.endsWith('.claude.ai');
}

export function detectClaudeState(doc: Document): ConversationState {
  const url = new URL(doc.location?.href || 'https://claude.ai');
  const isMatch = isClaudeUrl(url);

  if (!isMatch) {
    return {
      isAvailable: false,
      isInConversation: false,
    };
  }

  // Check URL conversation ID: claude.ai/chat/<uuid>
  const pathParts = url.pathname.split('/').filter(Boolean);
  let conversationId: string | undefined;
  if (pathParts[0] === 'chat' && pathParts[1]) {
    conversationId = pathParts[1];
  }

  // Check for conversation turns in DOM — use deduplication to avoid overcounting
  const turnSet = new Set<Element>();
  doc.querySelectorAll('div[data-test-render-count]').forEach((el) => turnSet.add(el));
  if (turnSet.size === 0) {
    doc.querySelectorAll('div[data-testid="chat-message"]').forEach((el) => turnSet.add(el));
  }
  if (turnSet.size === 0) {
    doc.querySelectorAll('.font-claude-message, .font-user-message').forEach((el) => turnSet.add(el));
  }
  const messageCount = turnSet.size;
  const isNewChatPage = url.pathname === '/new' || url.pathname === '/' || url.pathname === '/chats';
  const isInConversation = messageCount > 0 || (!!conversationId && !isNewChatPage);

  // Extract title from DOM or document.title
  let title = '';
  const titleEl = doc.querySelector<HTMLElement>(
    'button[data-testid="chat-title-button"], div[data-testid="chat-title"], h1.chat-title, [data-testid="conversation-title"]'
  );
  if (titleEl && titleEl.textContent?.trim()) {
    title = titleEl.textContent.trim();
  }

  if (!title && doc.title) {
    title = doc.title
      .replace(/\s*[-–—|]\s*Claude\s*$/i, '')
      .replace(/^Claude\s*[-–—|]\s*/i, '')
      .trim();
  }

  // Check if history is fully loaded (look for load earlier buttons or top turn index)
  let isHistoryFullyLoaded = true;
  const loadMoreBtn = doc.querySelector(
    'button[data-testid="load-more-messages"], .load-earlier-messages'
  );
  if (loadMoreBtn) {
    isHistoryFullyLoaded = false;
  }

  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'Claude Conversation',
    messageCount,
    isHistoryFullyLoaded,
  };
}
