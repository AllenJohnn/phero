export function isChatGPTUrl(url) {
  const host = url.hostname.toLowerCase();
  return host === 'chatgpt.com' || host === 'chat.openai.com' || host.endsWith('.chatgpt.com') || host.endsWith('.openai.com');
}
export function detectChatGPTState(doc) {
  const url = new URL(doc.location?.href || 'https://chatgpt.com');
  const isMatch = isChatGPTUrl(url);
  if (!isMatch) {
    return {
      isAvailable: false,
      isInConversation: false
    };
  }
  const pathParts = url.pathname.split('/').filter(Boolean);
  let conversationId;
  if (pathParts[0] === 'c' && pathParts[1]) {
    conversationId = pathParts[1];
  } else if (pathParts[0] === 'g' && pathParts[2] === 'c') {
    conversationId = pathParts[3];
  }
  const turns = doc.querySelectorAll('article[data-testid^="conversation-turn-"], div[data-message-author-role]');
  const messageCount = turns.length;
  const isInConversation = messageCount > 0 || !!conversationId;
  let title = '';
  if (conversationId) {
    const activeSidebarLink = doc.querySelector(`nav a[href*="${conversationId}"]`);
    if (activeSidebarLink) {
      const titleDiv = activeSidebarLink.querySelector('.truncate') || activeSidebarLink;
      title = titleDiv.textContent?.trim() || '';
    }
  }
  if (!title) {
    title = (doc.title || '').replace(/\s*[-–—]\s*ChatGPT\s*$/i, '').trim();
  }
  let isHistoryFullyLoaded = true;
  if (turns.length > 0) {
    const firstTurn = turns[0];
    const testId = firstTurn.getAttribute('data-testid') || '';
    const match = testId.match(/conversation-turn-(\d+)/);
    if (match && parseInt(match[1], 10) > 1) {
      isHistoryFullyLoaded = false;
    }
  }
  const isStreaming = !!doc.querySelector('button[aria-label="Stop generating"], .result-streaming, .streaming');
  return {
    isAvailable: true,
    isInConversation,
    conversationId,
    title: title || 'ChatGPT Conversation',
    messageCount,
    isHistoryFullyLoaded,
    isStreaming
  };
}