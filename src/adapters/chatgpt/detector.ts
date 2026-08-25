import { ConversationState } from '../types.ts';

export function isChatGPTUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'chatgpt.com' || host === 'chat.openai.com' || host.endsWith('.chatgpt.com') || host.endsWith('.openai.com');
}

export function detectChatGPTState(doc: Document): ConversationState {
  const url = new URL(doc.location?.href || 'https://chatgpt.com');
  const isMatch = isChatGPTUrl(url);

  if (!isMatch) {
    return {
      isAvailable: false,
      isInConversation: false,
    };
  }

  // Check URL conversation ID
  const pathParts = url.pathname.split('/').filter(Boolean);
  let conversationId: string | undefined;
  if (pathParts[0] === 'c' && pathParts[1]) {
    conversationId = pathParts[1];
  } else if (pathParts[0] === 'g' && pathParts[2] === 'c') {
    // Custom GPT conversation URL /g/g-xxx/c/yyy
    conversationId = pathParts[3];
  }

  // Check for conversation turns in DOM
  const turns = doc.querySelectorAll('article[data-testid^="conversation-turn-"], div[data-message-author-role]');
  const messageCount = turns.length;
  const isInConversation = messageCount > 0 || !!conversationId;

  // Extract title
  let title = doc.title;
  if (title) {
    title = title.replace(/\s*[-–—]\s*ChatGPT\s*$/i, '').trim();
  }

  // Completeness check heuristic: check if top turn index is 0 or 1
  let isHistoryFullyLoaded = true;
  if (turns.length > 0) {
    const firstTurn = turns[0];
    const testId = firstTurn.getAttribute('data-testid') || '';
    const match = testId.match(/conversation-turn-(\d+)/);
    if (match && parseInt(match[1], 10) > 1) {
      // First visible turn is turn 2, 3, etc. => Earlier turns are virtualized/lazy-loaded
      isHistoryFullyLoaded = false;
    }
  }

  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'ChatGPT Conversation',
    messageCount,
    isHistoryFullyLoaded,
  };
}
