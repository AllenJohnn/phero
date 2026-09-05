import { NormalizedMessage, ContentBlock } from '../../core/models/conversation.ts';
import { Logger } from '../../shared/logger.ts';

const PHERO_NETWORK_EVENT = '__phero_chatgpt_conversation_data__';

export type NetworkCaptureResult = {
  messages: NormalizedMessage[];
  conversationId: string;
  title: string;
  totalMessages: number;
  captureMethod: 'DATA_LEVEL';
};

// Storage for cached conversation data (module-level, lives as long as the content script)
let cachedConversationData: Map<string, any> = new Map();

/**
 * Installs the event listener on the document to capture intercepted data.
 * Call once when the content script loads on a ChatGPT page.
 */
export function installNetworkCaptureListener(doc: Document): void {
  doc.addEventListener('__phero_chatgpt_log__', ((e: CustomEvent) => {
    Logger.info('[MAIN WORLD] ' + e.detail);
  }) as EventListener);

  doc.addEventListener(PHERO_NETWORK_EVENT, ((e: CustomEvent) => {
    const data = e.detail;
    if (data && data.conversation_id) {
      cachedConversationData.set(data.conversation_id, data);
      Logger.info('Intercepted conversation data via network capture', {
        conversationIdPresent: true,
        recordsDetected: Object.keys(data.mapping || {}).length,
        requestStatus: 'SUCCESS',
        captureMethod: 'DATA_LEVEL'
      });
    }
  }) as EventListener);
}

/**
 * Parses ChatGPT's conversation mapping tree into ordered NormalizedMessage[].
 * Walks from root to current_node following the main conversation branch.
 */
export function parseConversationMapping(
  mapping: Record<string, any>,
  currentNode: string
): NormalizedMessage[] {
  const path: any[] = [];
  let curr: string | null = currentNode;
  
  // Walk backwards from current_node to root
  while (curr && mapping[curr]) {
    const node: any = mapping[curr];
    path.push(node);
    curr = node.parent;
  }
  
  // Reverse to get chronological order
  path.reverse();
  
  const messages: NormalizedMessage[] = [];
  
  for (const node of path) {
    if (!node.message || !node.message.author || !node.message.content) continue;
    
    const role = node.message.author.role === 'user' ? 'user' : 'assistant';
    const contentParts = node.message.content.parts || [];
    
    // Simple text extraction for now
    let textContent = '';
    for (const part of contentParts) {
      if (typeof part === 'string') {
        textContent += part + '\n';
      }
    }
    
    if (textContent.trim()) {
      messages.push({
        id: node.message.id,
        role,
        content: [{ type: 'text', text: textContent.trim() }] as ContentBlock[],
      });
    }
  }
  
  return messages;
}

export async function attemptNetworkCapture(url: string): Promise<NetworkCaptureResult | null> {
  const match = url.match(/\/c\/([a-zA-Z0-9-]+)/);
  if (!match) return null;
  
  const uuid = match[1];
  
  let data = cachedConversationData.get(uuid);

  if (!data) {
    Logger.info(`[PHERO] Data not in cache. Attempting direct API fetch for ${uuid}...`);
    try {
      const res = await fetch(`https://chatgpt.com/backend-api/conversation/${uuid}`);
      if (res.ok) {
        data = await res.json();
        Logger.info(`[PHERO] Direct API fetch successful!`);
      } else {
        Logger.warn(`[PHERO] Direct API fetch failed with status ${res.status}`);
      }
    } catch (e) {
      Logger.warn(`[PHERO] Direct API fetch error: ${String(e)}`);
    }
  }

  if (data && data.mapping && data.current_node) {
    try {
      const messages = parseConversationMapping(data.mapping, data.current_node);
      return {
        messages,
        conversationId: data.conversation_id,
        title: data.title || 'ChatGPT Conversation',
        totalMessages: messages.length,
        captureMethod: 'DATA_LEVEL'
      };
    } catch (e) {
      Logger.error('Failed to parse network capture mapping', e);
      return null;
    }
  }
  
  return null;
}
