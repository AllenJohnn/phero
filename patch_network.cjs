const fs = require('fs');
let content = fs.readFileSync('src/adapters/chatgpt/network-capture.ts', 'utf8');

const newScript = `
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
          const event = new CustomEvent('\${PHERO_NETWORK_EVENT}', { detail: eventData });
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
              // ChatGPT's conversation data is often inside a nested object or directly here
              if (data && data.conversation && data.conversation.mapping) {
                emitData(data.conversation);
              } else if (data && data.mapping) {
                emitData(data);
              }
            }
          }
        } catch (e) {}
      }

      // 3. Scan __NEXT_DATA__ just in case (legacy)
      function checkNextData() {
        try {
          const next = window.__NEXT_DATA__;
          if (next && next.props && next.props.pageProps && next.props.pageProps.serverResponse) {
             emitData(next.props.pageProps.serverResponse);
          }
        } catch (e) {}
      }

      // 4. Initial check
      checkRemixContext();
      checkNextData();
      
      // Also check on client-side navigation
      let lastUrl = location.href;
      new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          setTimeout(checkRemixContext, 500);
          setTimeout(checkRemixContext, 2000);
        }
      }).observe(document, { subtree: true, childList: true });

      // 5. Intercept Fetch for both raw and Remix data
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        const response = await originalFetch.apply(this, args);
        
        const isBackendApi = url.match(/\\/backend-api\\/conversation\\/[0-9a-fA-F-]{36}(?:\\?.+)?$/);
        const isRemixData = url.includes('_data=');
        
        if ((isBackendApi || isRemixData) && response.ok) {
          try {
            const clone = response.clone();
            clone.json().then(data => {
               if (isBackendApi) {
                 emitData(data);
               } else if (isRemixData) {
                 // Remix loader data returns the data object
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

content = content.replace(/return \`[\s\S]*?    \(\)\);\n  \`;/, 'return `\n' + newScript + '\n  `;');
fs.writeFileSync('src/adapters/chatgpt/network-capture.ts', content);
