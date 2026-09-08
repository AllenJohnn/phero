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


let cachedConversationData: Map<string, any> = new Map();


export function installNetworkCaptureListener(doc: Document): void {
  doc.addEventListener('__phero_chatgpt_log__', ((e: CustomEvent) => {
    Logger.info('[MAIN WORLD] ' + e.detail);
  }) as EventListener);

  doc.addEventListener(PHERO_NETWORK_EVENT, ((e: CustomEvent) => {
    
    let data: any = e.detail;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        Logger.warn('Failed to parse network capture event detail as JSON');
        return;
      }
    }
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


export function parseConversationMapping(
  mapping: Record<string, any>,
  currentNode: string
): NormalizedMessage[] {
  const path: any[] = [];
  let curr: string | null = currentNode;
  
  
  while (curr && mapping[curr]) {
    const node: any = mapping[curr];
    path.push(node);
    curr = node.parent;
  }
  
  
  path.reverse();
  
  const messages: NormalizedMessage[] = [];
  
  for (const node of path) {
    if (!node.message || !node.message.author) continue;
    
    const authorRole = node.message.author.role;
    
    if (authorRole === 'system') continue;
    
    const role = authorRole === 'user' ? 'user' : 'assistant';
    const content = node.message.content;
    if (!content) continue;
    
    const blocks: ContentBlock[] = [];
    const contentType = content.content_type || 'text';
    
    
    if (content.parts && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (typeof part === 'string') {
          if (part.trim()) {
            blocks.push({ type: 'text', text: part.trim() });
          }
        } else if (part && typeof part === 'object') {
          
          if (part.content_type === 'image_asset_pointer' || part.asset_pointer) {
            const alt = part.metadata?.dalle?.prompt || part.alt || 'image';
            const url = part.asset_pointer || part.url || '';
            blocks.push({ type: 'image', url, alt });
          } else if (part.content_type === 'file') {
            const name = part.name || part.filename || 'file';
            blocks.push({ type: 'file', name });
          } else if (part.text) {
            blocks.push({ type: 'text', text: part.text.trim() });
          }
        }
      }
    }
    
    
    if (content.text && typeof content.text === 'string' && content.text.trim()) {
      if (contentType === 'code') {
        const lang = content.language || 'python';
        blocks.push({ type: 'code', language: lang, code: content.text.trim() } as ContentBlock);
      } else if (contentType === 'execution_output') {
        blocks.push({ type: 'text', text: `[Execution Output]\n${content.text.trim()}` });
      } else if (contentType === 'tether_browsing_display' || contentType === 'tether_quote') {
        blocks.push({ type: 'text', text: content.text.trim() });
      } else {
        
        blocks.push({ type: 'text', text: content.text.trim() });
      }
    }
    
    if (blocks.length > 0) {
      messages.push({
        id: node.message.id,
        role,
        content: blocks,
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
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 500));
      data = cachedConversationData.get(uuid);
      if (data) {
        Logger.info(`[PHERO] Cache hit after ${(i + 1) * 500}ms wait`);
        break;
      }
    }
  }

  
  if (!data) {
    Logger.info(`[PHERO] Requesting page-world proactive fetch for ${uuid}`);
    document.dispatchEvent(new CustomEvent('__phero_request_conversation_data__', { detail: uuid }));
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      data = cachedConversationData.get(uuid);
      if (data) {
        Logger.info(`[PHERO] Cache hit after on-demand fetch, ${(i + 1) * 500}ms`);
        break;
      }
    }
  }

  if (!data) {
    Logger.warn(`[PHERO] All capture methods failed for ${uuid}`);
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
