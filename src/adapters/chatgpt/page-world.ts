// This script runs in the MAIN world (page context).
// It cannot use extension APIs (e.g., chrome.runtime).

const PHERO_NETWORK_EVENT = '__phero_chatgpt_conversation_data__';
const PHERO_LOG_EVENT = '__phero_chatgpt_log__';

(function() {
  function sendLog(msg: string) {
    console.log(msg);
    document.dispatchEvent(new CustomEvent(PHERO_LOG_EVENT, { detail: msg }));
  }

  sendLog('[PHERO] NETWORK_CAPTURE_SCRIPT_STARTED');
  
  // 1. Helper to emit data
  function emitData(data: any) {
    if (data && data.mapping && data.conversation_id && data.current_node) {
      sendLog('[PHERO] NETWORK_DATA_FOUND via ' + (data.source || 'unknown'));
      const eventData = {
        mapping: data.mapping,
        title: data.title || '',
        conversation_id: data.conversation_id,
        current_node: data.current_node
      };
      
      const keys = Object.keys(data.mapping);
      sendLog('[PHERO] NETWORK_MESSAGES=' + keys.length);
      
      const event = new CustomEvent(PHERO_NETWORK_EVENT, { detail: eventData });
      document.dispatchEvent(event);
    } else {
      sendLog('[PHERO] INVALID_NETWORK_DATA_FOUND (missing mapping, conversation_id, or current_node). Keys: ' + Object.keys(data || {}).join(', '));
    }
  }

  // 2. Scan window.__remixContext on load and periodically
  function checkRemixContext() {
    try {
      const w = window as any;
      const ctx = w.__remixContext;
      if (ctx) {
        sendLog('[PHERO] __remixContext exists');
        if (ctx.state && ctx.state.loaderData) {
          let foundAny = false;
          for (const key of Object.keys(ctx.state.loaderData)) {
            const data = ctx.state.loaderData[key];
            if (data && data.conversation && data.conversation.mapping) {
              data.conversation.source = 'remixContext.conversation (' + key + ')';
              emitData(data.conversation);
              foundAny = true;
            } else if (data && data.mapping) {
              data.source = 'remixContext.mapping (' + key + ')';
              emitData(data);
              foundAny = true;
            }
          }
          if (!foundAny) {
            sendLog('[PHERO] __remixContext.state.loaderData exists but contains no mapping data');
          }
        } else {
          sendLog('[PHERO] __remixContext exists but state.loaderData is missing');
        }
      } else {
        sendLog('[PHERO] __remixContext DOES NOT exist on window');
      }
    } catch (e) {
      sendLog('[PHERO] Error checking __remixContext: ' + String(e));
    }
  }

  // 3. Scan __NEXT_DATA__ just in case
  function checkNextData() {
    try {
      const w = window as any;
      const next = w.__NEXT_DATA__;
      if (next) {
        sendLog('[PHERO] __NEXT_DATA__ exists');
        if (next.props && next.props.pageProps && next.props.pageProps.serverResponse) {
           next.props.pageProps.serverResponse.source = 'NEXT_DATA';
           emitData(next.props.pageProps.serverResponse);
        }
      }
    } catch (e) {
      sendLog('[PHERO] Error checking __NEXT_DATA__: ' + String(e));
    }
  }

  // Periodically check for Remix context on initial load since it won't exist at document_start
  let loadCheckCount = 0;
  const loadCheckInterval = setInterval(() => {
    checkRemixContext();
    checkNextData();
    loadCheckCount++;
    if (loadCheckCount > 20 || (window as any).__remixContext) { // 20 * 500ms = 10s max
      clearInterval(loadCheckInterval);
    }
  }, 500);
  
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
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && (args[0] as any).url ? (args[0] as any).url : '');
    const response = await originalFetch.apply(this, args);
    
    const isBackendApi = url.includes('/backend-api/conversation/') && !url.includes('/limits') && !url.includes('/limit');
    const isRemixData = url.includes('_data=');
    
    if ((isBackendApi || isRemixData) && response.ok) {
      try {
        const clone = response.clone();
        clone.json().then(data => {
           if (isBackendApi) {
             data.source = 'fetch_backend_api';
             emitData(data);
           } else if (isRemixData) {
             if (data && data.conversation && data.conversation.mapping) {
               data.conversation.source = 'fetch_remix_data.conversation';
               emitData(data.conversation);
             } else if (data && data.mapping) {
               data.source = 'fetch_remix_data.mapping';
               emitData(data);
             }
           }
        }).catch(_e => {});
      } catch (_e) {}
    }
    return response;
  };
  
  sendLog('[PHERO] NETWORK_CAPTURE_INTERCEPTOR_INSTALLED');
})();
