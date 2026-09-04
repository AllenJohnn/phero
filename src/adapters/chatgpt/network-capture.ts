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
        content: [{ type: 'text', value: textContent.trim() }] as ContentBlock[],
      });
    }
  }
  
  return messages;
}

/**
 * Attempts to retrieve and parse the conversation data from the network cache.
 */
export async function attemptNetworkCapture(url: string): Promise<NetworkCaptureResult | null> {
  const match = url.match(/\/c\/([a-zA-Z0-9-]+)/);
  if (!match) return null;
  
  const uuid = match[1];
  
  // Give it a tiny bit of time if we just loaded the page
  let retries = 3;
  while (retries > 0) {
    const data = cachedConversationData.get(uuid);
    
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
    
    await new Promise(r => setTimeout(r, 100));
    retries--;
  }
  
  return null;
}
