import React, { useEffect, useState } from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { PheroLogo, ClaudeLogo, ChatGPTLogo, SpinnerIcon, CheckIcon, AlertIcon } from '../icons/index.tsx';
import { Logger } from '../../shared/logger.ts';

export const Popup: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    async function checkCurrentTab() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) {
          setLoading(false);
          return;
        }

        const url = new URL(tab.url);
        if (url.hostname.includes('chatgpt.com') || url.hostname.includes('openai.com')) {
          setProviderId('chatgpt');
        } else if (url.hostname.includes('claude.ai')) {
          setProviderId('claude');
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'PHERO_CHECK_STATE' });
        } catch {
          // Tab may have been opened before extension load
        }
      } catch (err) {
        Logger.error('Failed to query tab in popup', err);
      } finally {
        setLoading(false);
      }
    }

    checkCurrentTab();
  }, []);

  const handleTriggerHandoff = async (dest: ProviderId) => {
    try {
      setTransferring(true);
      setErrorText(null);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');

      let response: any;
      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          type: 'PHERO_TRIGGER_HANDOFF',
          destinationProvider: dest,
        });
      } catch {
        // If content script was not ready, dynamically inject and retry
        if (chrome.scripting) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          await new Promise((r) => setTimeout(r, 120));
          response = await chrome.tabs.sendMessage(tab.id, {
            type: 'PHERO_TRIGGER_HANDOFF',
            destinationProvider: dest,
          });
        }
      }

      if (response && response.success) {
        setTransferSuccess(true);
        setTimeout(() => {
          window.close();
        }, 1100);
      } else {
        throw new Error(response?.error || 'No active conversation found.');
      }
    } catch (err) {
      Logger.error('Error triggering handoff from popup', err);
      const msg = err instanceof Error ? err.message : 'Error starting transfer.';
      setErrorText(msg.includes('Receiving end') ? 'Please refresh the chat page once.' : msg);
      setTransferring(false);
    }
  };

  return (
    <div className="w-64 bg-zinc-950 text-zinc-100 p-3.5 font-sans antialiased select-none border border-zinc-800 rounded-xl shadow-2xl">
      {/* Minimal Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-900">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <PheroLogo size={12} />
          </div>
          <span className="text-xs font-bold tracking-tight text-white">PHERO</span>
        </div>
        {providerId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
            {providerId === 'chatgpt' ? 'ChatGPT' : 'Claude'}
          </span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-4 flex items-center justify-center text-zinc-500 gap-2 text-xs">
          <SpinnerIcon size={13} />
          <span>Detecting chat…</span>
        </div>
      ) : !providerId ? (
        <div className="py-3 text-center text-xs text-zinc-400">
          Open a ChatGPT or Claude tab to carry it forward.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-0.5">
            Continue in
          </div>

          {providerId !== 'claude' && (
            <button
              onClick={() => handleTriggerHandoff('claude')}
              disabled={transferring}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <ClaudeLogo size={14} />
                <span>Claude</span>
              </div>
              {transferring ? (
                <SpinnerIcon size={12} className="text-amber-400" />
              ) : transferSuccess ? (
                <CheckIcon size={12} className="text-emerald-400" />
              ) : (
                <span className="text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all">
                  →
                </span>
              )}
            </button>
          )}

          {providerId !== 'chatgpt' && (
            <button
              onClick={() => handleTriggerHandoff('chatgpt')}
              disabled={transferring}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <ChatGPTLogo size={14} />
                <span>ChatGPT</span>
              </div>
              {transferring ? (
                <SpinnerIcon size={12} className="text-emerald-400" />
              ) : transferSuccess ? (
                <CheckIcon size={12} className="text-emerald-400" />
              ) : (
                <span className="text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all">
                  →
                </span>
              )}
            </button>
          )}

          {errorText && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg leading-snug">
              <AlertIcon size={13} className="shrink-0" />
              <span>{errorText}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
