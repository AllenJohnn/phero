import { Logger } from '../../shared/logger.js';

function splitMarkdownText(text, blocksArray) {
  if (!text) return;
  const regex = /```([\w\-+]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const precedingText = text.slice(lastIndex, match.index).trim();
      if (precedingText) {
        blocksArray.push({ type: 'text', text: precedingText });
      }
    }
    blocksArray.push({
      type: 'code',
      language: match[1] ? match[1].trim() : 'text',
      code: match[2].trim()
    });
    lastIndex = regex.lastIndex;
  }
  const trailingText = text.slice(lastIndex).trim();
  if (trailingText) {
    blocksArray.push({ type: 'text', text: trailingText });
  }
}

export function parseClaudeMessages(chatMessages, leafUuid) {
  const msgMap = new Map();
  for (const msg of chatMessages) {
    msgMap.set(msg.uuid, msg);
  }

  const path = [];
  let currId = leafUuid;

  while (currId && currId !== '00000000-0000-4000-8000-000000000000') {
    const msg = msgMap.get(currId);
    if (!msg) break;
    path.push(msg);
    currId = msg.parent_message_uuid;
  }

  path.reverse();

  const normalized = [];
  for (const msg of path) {
    const role = msg.sender === 'human' ? 'user' : 'assistant';
    const blocks = [];

    if (msg.content && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          splitMarkdownText(part.text, blocks);
        } else if (part.type === 'tool_use' || part.type === 'tool_result') {
          blocks.push({
            type: 'text',
            text: `[${part.type}]\n${JSON.stringify(part.input || part.content || part)}`
          });
        }
        // ignoring thinking blocks as per spec
      }
    } else if (msg.text) {
      splitMarkdownText(msg.text, blocks);
    }

    if (blocks.length > 0) {
      normalized.push({
        id: msg.uuid,
        role,
        content: blocks
      });
    }
  }

  return normalized;
}

export async function attemptNetworkCapture(url) {
  const match = url.match(/\/chat\/([a-zA-Z0-9-]+)/);
  if (!match) return null;
  const conversationId = match[1];

  if (!/^[a-zA-Z0-9-]+$/.test(conversationId)) return null;

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'claude-fetch-conversation',
        conversationId
      }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (!response || !response.success || !response.data) {
      Logger.warn(`[PHERO] Claude network capture failed: ${response?.error || 'Unknown error'}`);
      return null;
    }

    const data = response.data;

    if (!data.chat_messages || !data.current_leaf_message_uuid) {
      return null;
    }

    const messages = parseClaudeMessages(data.chat_messages, data.current_leaf_message_uuid);

    return {
      messages,
      conversationId: data.uuid,
      title: data.name || 'Claude Conversation',
      totalMessages: messages.length,
      captureMethod: 'DATA_LEVEL'
    };
  } catch (err) {
    Logger.error('Error during Claude network capture', err);
    return null;
  }
}
