import React from 'react';
import ReactDOM from 'react-dom/client';
import { FloatingPill } from './FloatingPill.tsx';
import { ProviderId } from '../../core/models/conversation.ts';
import { Logger } from '../../shared/logger.ts';

const SHADOW_HOST_ID = 'phero-floating-host';

// Scoped CSS reset & Tailwind utility styles for Shadow DOM isolation
const SHADOW_STYLES = `
:host {
  all: initial;
  z-index: 2147483647;
  position: fixed;
  bottom: 0;
  right: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.fixed { position: fixed; }
.absolute { position: absolute; }
.bottom-5 { bottom: 1.25rem; }
.right-5 { right: 1.25rem; }
.bottom-12 { bottom: 3rem; }
.right-0 { right: 0px; }
.z-50 { z-index: 50; }
.w-56 { width: 14rem; }
.w-80 { width: 20rem; }
.w-full { width: 100%; }
.w-5 { width: 1.25rem; }
.h-5 { height: 1.25rem; }
.flex { display: flex; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.justify-center { justify-content: center; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-2\\.5 { gap: 0.625rem; }
.p-1\\.5 { padding: 0.375rem; }
.p-4 { padding: 1rem; }
.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.pt-2 { padding-top: 0.5rem; }
.pl-1 { padding-left: 0.25rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mt-0\\.5 { margin-top: 0.125rem; }
.mt-1 { margin-top: 0.25rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.rounded { border-radius: 0.25rem; }
.border { border-width: 1px; border-style: solid; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.border-t { border-top-width: 1px; border-top-style: solid; }
.border-zinc-800 { border-color: #27272a; }
.border-zinc-700 { border-color: #3f3f46; }
.border-zinc-900 { border-color: #18181b; }
.border-amber-500\\/30 { border-color: rgba(245, 158, 11, 0.3); }
.border-emerald-800\\/80 { border-color: rgba(6, 95, 70, 0.8); }
.border-rose-800\\/80 { border-color: rgba(159, 18, 57, 0.8); }
.bg-zinc-950 { background-color: #09090b; }
.bg-zinc-950\\/95 { background-color: rgba(9, 9, 11, 0.95); }
.bg-zinc-950\\/90 { background-color: rgba(9, 9, 11, 0.9); }
.bg-zinc-900 { background-color: #18181b; }
.bg-zinc-800 { background-color: #27272a; }
.bg-amber-500\\/20 { background-color: rgba(245, 158, 11, 0.2); }
.bg-emerald-950\\/80 { background-color: rgba(6, 78, 59, 0.8); }
.bg-rose-950\\/80 { background-color: rgba(136, 19, 55, 0.8); }
.text-zinc-100 { color: #f4f4f5; }
.text-zinc-200 { color: #e4e4e7; }
.text-zinc-300 { color: #d4d4d8; }
.text-zinc-400 { color: #a1a1aa; }
.text-zinc-500 { color: #71717a; }
.text-blue-400 { color: #60a5fa; }
.text-emerald-400 { color: #34d399; }
.text-emerald-200 { color: #a7f3d0; }
.text-amber-400 { color: #fbbf24; }
.text-amber-300 { color: #fcd34d; }
.text-rose-400 { color: #fb7185; }
.text-rose-300 { color: #fda4af; }
.text-rose-200 { color: #fecdd3; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-\\[11px\\] { font-size: 11px; line-height: 14px; }
.text-\\[10px\\] { font-size: 10px; line-height: 12px; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-wider { letter-spacing: 0.05em; }
.uppercase { text-transform: uppercase; }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3); }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
.backdrop-blur-md { backdrop-filter: blur(12px); }
.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }
.transition-all { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.transition-colors { transition-property: color, background-color, border-color; transition-duration: 150ms; }
.transition-transform { transition-property: transform; transition-duration: 150ms; }
.duration-150 { transition-duration: 150ms; }
.duration-200 { transition-duration: 200ms; }
.space-y-0\\.5 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.125rem; }
.underline { text-decoration-line: underline; }
.animate-spin { animation: spin 1s linear infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

button {
  background: transparent;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

button:hover {
  opacity: 0.95;
}
`;

export function mountFloatingPill(sourceProvider: ProviderId): () => void {
  // Prevent duplicate mounts
  const existing = document.getElementById(SHADOW_HOST_ID);
  if (existing) {
    existing.remove();
  }

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Add styles
  const styleEl = document.createElement('style');
  styleEl.textContent = SHADOW_STYLES;
  shadowRoot.appendChild(styleEl);

  // Mount container
  const container = document.createElement('div');
  shadowRoot.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(FloatingPill, { sourceProvider }));

  Logger.info('Mounted PHERO floating action pill in Shadow DOM', { sourceProvider });

  return () => {
    root.unmount();
    host.remove();
  };
}
