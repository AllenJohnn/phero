import { NormalizedMessage, ContentBlock } from '../../core/models/conversation.ts';
import { Logger } from '../../shared/logger.ts';

const PHERO_NETWORK_EVENT = '__phero_chatgpt_conversation_data__';
const SCRIPT_MARKER = 'data-phero-interceptor';

export type NetworkCaptureResult = {
  messages: NormalizedMessage[];
  conversationId: string;
  title: string;
  totalMessages: number;
  captureMethod: 'DATA_LEVEL';
};

/**
 * Returns the page-world script source that intercepts fetch responses.
 * This script runs in the MAIN world (page context), not the content script context.
 * It must NOT reference any extension APIs or import statements.
 */
export function getPageWorldInterceptorSource(): string {
  return `

    (function() {
      // 1. Helper to emit data
      function emitData(data) {
        if (data && data.mapping && data.conversation_id && data.current_node) {
          const eventData = {
            mapping: data.mapping,
            title: data.title || '',
            conversation_id: data.conversation_id,
            current_node: data.current_node
          };
          const event = new CustomEvent('${PHERO_NETWORK_EVENT}', { detail: eventData });
          document.dispatchEvent(event);
        }
      }

      // 2. Scan window.__remixContext on load and periodically
      function checkRemixContext() {
        try {
          const ctx = window.__remixContext;
          if (ctx && ctx.state && ctx.state.loaderData) {
            for (const key of Object.keys(ctx.state.loaderData)) {
              const data = ctx.state.loaderData[key];
              if (data && data.conversation && data.conversation.mapping) {
                emitData(data.conversation);
              } else if (data && data.mapping) {
                emitData(data);
              }
            }
          }
        } catch (e) {}
      }

      // 3. Scan __NEXT_DATA__ just in case
      function checkNextData() {
        try {
          const next = window.__NEXT_DATA__;
          if (next && next.props && next.props.pageProps && next.props.pageProps.serverResponse) {
             emitData(next.props.pageProps.serverResponse);
          }
        } catch (e) {}
      }

      checkRemixContext();
      checkNextData();
      
      let lastUrl = location.href;
      new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          setTimeout(checkRemixContext, 500);
          setTimeout(checkRemixContext, 2000);
        }
      }).observe(document, { subtree: true, childList: true });

      // 4. Intercept Fetch
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        const response = await originalFetch.apply(this, args);
        
        const isBackendApi = url.includes('/backend-api/conversation/');
        const isRemixData = url.includes('_data=');
        
        if ((isBackendApi || isRemixData) && response.ok) {
          try {
            const clone = response.clone();
            clone.json().then(data => {
               if (isBackendApi) {
                 emitData(data);
               } else if (isRemixData) {
                 if (data && data.conversation && data.conversation.mapping) {
                   emitData(data.conversation);
                 } else if (data && data.mapping) {
                   emitData(data);
                 }
               }
            }).catch(e => {});
          } catch (e) {}
        }
        return response;
      };
    })();

  `;
}

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
 * Injects the page-world interceptor script into the document.
 * Uses a <script> tag with the page script source.
 * Safe to call multiple times - will not re-inject if already present.
 */
export function injectPageWorldInterceptor(doc: Document): void {
  if (doc.querySelector(`script[${SCRIPT_MARKER}]`)) {
    return;
  }
  
  const script = doc.createElement('script');
  script.textContent = getPageWorldInterceptorSource();
  script.setAttribute(SCRIPT_MARKER, 'true');
  (doc.head || doc.documentElement).appendChild(script);
  script.remove(); // Clean up DOM immediately after execution
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
  
  // Reverse to get oldest-first order
  path.reverse();
  
  const messages: NormalizedMessage[] = [];
  
  for (const node of path) {
    if (!node.message) continue;
    
    const msg = node.message;
    const authorRole = msg.author?.role;
    
    // Filter out system, tool, and missing roles
    if (!authorRole || authorRole === 'system' || authorRole === 'tool') continue;
    
    const role = authorRole === 'user' ? 'user' : 'assistant';
    const contentData = msg.content;
    
    if (!contentData || contentData.content_type !== 'text' || !Array.isArray(contentData.parts)) {
      continue;
    }
    
    const blocks: ContentBlock[] = [];
    const textParts = contentData.parts.filter((p: any) => typeof p === 'string');
    const fullText = textParts.join('');
    
    if (!fullText.trim()) continue;
    
    // Parse code blocks (```language\ncode\n```)
    const codeBlockRegex = /\`\`\`([a-zA-Z0-9_-]*)\n([\s\S]*?)\`\`\`/g;
    let lastIndex = 0;
    let match;
    
    while ((match = codeBlockRegex.exec(fullText)) !== null) {
      const precedingText = fullText.substring(lastIndex, match.index);
      if (precedingText) {
        blocks.push({ type: 'text', text: precedingText });
      }
      
      const language = match[1] || undefined;
      const code = match[2];
      blocks.push({ type: 'code', language, code });
      
      lastIndex = match.index + match[0].length;
    }
    
    const remainingText = fullText.substring(lastIndex);
    if (remainingText) {
      blocks.push({ type: 'text', text: remainingText });
    }
    
    messages.push({
      id: msg.id || node.id,
      role,
      content: blocks,
      timestamp: msg.create_time ? Math.floor(msg.create_time * 1000) : Date.now()
    });
  }
  
  return messages;
}

/**
 * Attempts to capture the conversation data from a previously intercepted network response.
 * Sets up a listener for the custom event and also tries to trigger a fresh fetch
 * by accessing the conversation page (which ChatGPT loads on navigation).
 * 
 * Returns null if no data is available within the timeout.
 */
export async function attemptNetworkCapture(
  doc: Document,
  conversationId: string | undefined,
  timeoutMs: number = 8000
): Promise<NetworkCaptureResult | null> {
  if (!conversationId) return null;
  
  // Check cache first
  const cachedData = cachedConversationData.get(conversationId);
  if (cachedData) {
    const messages = parseConversationMapping(cachedData.mapping, cachedData.current_node);
    return {
      messages,
      conversationId: cachedData.conversation_id,
      title: cachedData.title || '',
      totalMessages: messages.length,
      captureMethod: 'DATA_LEVEL'
    };
  }
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        doc.removeEventListener(PHERO_NETWORK_EVENT, listener as EventListener);
        resolve(null);
      }
    }, timeoutMs);
    
    const listener = (e: CustomEvent) => {
      const data = e.detail;
      if (data && data.conversation_id === conversationId) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          doc.removeEventListener(PHERO_NETWORK_EVENT, listener as EventListener);
          
          const messages = parseConversationMapping(data.mapping, data.current_node);
          resolve({
            messages,
            conversationId: data.conversation_id,
            title: data.title || '',
            totalMessages: messages.length,
            captureMethod: 'DATA_LEVEL'
          });
        }
      }
    };
    
    doc.addEventListener(PHERO_NETWORK_EVENT, listener as EventListener);
  });
}
