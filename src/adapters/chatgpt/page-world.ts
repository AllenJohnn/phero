// This script runs in the MAIN world (page context).
// It cannot use extension APIs (e.g., chrome.runtime).

const PHERO_NETWORK_EVENT = '__phero_chatgpt_conversation_data__';

(function() {
  console.log('[PHERO] NETWORK_CAPTURE_SCRIPT_STARTED');
  
  // 1. Helper to emit data
  function emitData(data: any) {
    if (data && data.mapping && data.conversation_id && data.current_node) {
      console.log('[PHERO] NETWORK_DATA_FOUND via ' + (data.source || 'unknown'));
      const eventData = {
        mapping: data.mapping,
        title: data.title || '',
        conversation_id: data.conversation_id,
        current_node: data.current_node
      };
      
      const keys = Object.keys(data.mapping);
      console.log('[PHERO] NETWORK_MESSAGES=' + keys.length);
      
      const event = new CustomEvent(PHERO_NETWORK_EVENT, { detail: eventData });
      document.dispatchEvent(event);
    }
  }

  // 2. Scan window.__remixContext on load and periodically
  function checkRemixContext() {
    try {
      const w = window as any;
      const ctx = w.__remixContext;
      if (ctx && ctx.state && ctx.state.loaderData) {
        for (const key of Object.keys(ctx.state.loaderData)) {
          const data = ctx.state.loaderData[key];
          if (data && data.conversation && data.conversation.mapping) {
            data.conversation.source = 'remixContext.conversation';
            emitData(data.conversation);
          } else if (data && data.mapping) {
            data.source = 'remixContext.mapping';
            emitData(data);
          }
        }
      }
    } catch (e) {}
  }

  // 3. Scan __NEXT_DATA__ just in case
  function checkNextData() {
    try {
      const w = window as any;
      const next = w.__NEXT_DATA__;
      if (next && next.props && next.props.pageProps && next.props.pageProps.serverResponse) {
         next.props.pageProps.serverResponse.source = 'NEXT_DATA';
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
        }).catch(e => {});
      } catch (e) {}
    }
    return response;
  };
  
  console.log('[PHERO] NETWORK_CAPTURE_INTERCEPTOR_INSTALLED');
})();
