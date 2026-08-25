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
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
.bottom-11 { bottom: 2.75rem; }
.right-0 { right: 0px; }
.z-50 { z-index: 50; }
.w-52 { width: 13rem; }
.w-72 { width: 18rem; }
.w-full { width: 100%; }
.w-4 { width: 1rem; }
.h-4 { height: 1rem; }
.flex { display: flex; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.justify-center { justify-content: center; }
.gap-1 { gap: 0.25rem; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-2\\.5 { gap: 0.625rem; }
.p-1\\.5 { padding: 0.375rem; }
.p-3\\.5 { padding: 0.875rem; }
.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.pt-2 { padding-top: 0.5rem; }
.pl-1 { padding-left: 0.25rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-2\\.5 { margin-bottom: 0.625rem; }
.mt-0\\.5 { margin-top: 0.125rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-full { border-radius: 9999px; }
.rounded { border-radius: 0.25rem; }
.border { border-width: 1px; border-style: solid; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.border-t { border-top-width: 1px; border-top-style: solid; }
.border-\\[\\#232326\\] { border-color: #232326; }
.border-\\[\\#36363A\\] { border-color: #36363a; }
.border-\\[\\#1E1E22\\] { border-color: #1e1e22; }
.border-\\[\\#D97706\\]\\/40 { border-color: rgba(217, 119, 6, 0.4); }
.border-\\[\\#D97706\\]\\/30 { border-color: rgba(217, 119, 6, 0.3); }
.border-\\[\\#059669\\]\\/60 { border-color: rgba(5, 150, 105, 0.6); }
.border-\\[\\#E11D48\\]\\/60 { border-color: rgba(225, 29, 72, 0.6); }
.bg-\\[\\#09090B\\] { background-color: #09090b; }
.bg-\\[\\#09090B\\]\\/95 { background-color: rgba(9, 9, 11, 0.95); }
.bg-\\[\\#09090B\\]\\/90 { background-color: rgba(9, 9, 11, 0.9); }
.bg-\\[\\#111113\\] { background-color: #111113; }
.bg-\\[\\#18181B\\] { background-color: #18181b; }
.bg-\\[\\#D97706\\]\\/20 { background-color: rgba(217, 119, 6, 0.2); }
.bg-\\[\\#D97706\\]\\/30 { background-color: rgba(217, 119, 6, 0.3); }
.bg-\\[\\#064E3B\\]\\/90 { background-color: rgba(6, 78, 59, 0.9); }
.bg-\\[\\#881337\\]\\/90 { background-color: rgba(136, 19, 55, 0.9); }
.text-\\[\\#F4F4F6\\] { color: #f4f4f6; }
.text-\\[\\#EDEDEF\\] { color: #ededef; }
.text-\\[\\#A1A1AA\\] { color: #a1a1aa; }
.text-\\[\\#8A8A93\\] { color: #8a8a93; }
.text-\\[\\#52525B\\] { color: #52525b; }
.text-\\[\\#D4D4D8\\] { color: #d4d4d8; }
.text-\\[\\#3B82F6\\] { color: #3b82f6; }
.text-\\[\\#10A37F\\] { color: #10a37f; }
.text-\\[\\#A7F3D0\\] { color: #a7f3d0; }
.text-\\[\\#D97706\\] { color: #d97706; }
.text-\\[\\#FBBF24\\] { color: #fbbf24; }
.text-\\[\\#E11D48\\] { color: #e11d48; }
.text-\\[\\#FECDD3\\] { color: #fecdd3; }
.text-rose-300 { color: #fda4af; }
.text-white { color: #ffffff; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-\\[11px\\] { font-size: 11px; line-height: 14px; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.tracking-tight { letter-spacing: -0.025em; }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4); }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); }
.backdrop-blur-md { backdrop-filter: blur(12px); }
.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }
.transition-all { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.transition-colors { transition-property: color, background-color, border-color; transition-duration: 150ms; }
.transition-transform { transition-property: transform; transition-duration: 150ms; }
.duration-150 { transition-duration: 150ms; }
.space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem; }
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
