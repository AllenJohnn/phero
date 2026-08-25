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

  // Check for conversation turns in DOM
  const turns = doc.querySelectorAll(
    'div[data-test-render-count], .font-claude-message, .font-user-message, div.standard-markdown'
  );
  const messageCount = turns.length;
  const isInConversation = messageCount > 0 || !!conversationId;

  // Extract title
  let title = doc.title;
  if (title) {
    title = title.replace(/\s*[-–—]\s*Claude\s*$/i, '').trim();
  }

  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'Claude Conversation',
    messageCount,
    isHistoryFullyLoaded: true,
  };
}
