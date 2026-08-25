import React, { useEffect, useState } from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { ConversationState } from '../../adapters/types.ts';
import { PheroLogo, ClaudeLogo, ChatGPTLogo, SpinnerIcon, CheckIcon, AlertIcon } from '../icons/index.tsx';
import { Logger } from '../../shared/logger.ts';

export const Popup: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);
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

        // Ask content script for state
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'PHERO_CHECK_STATE' });
          if (response?.state) {
            setState(response.state);
          }
        } catch {
          // Attempt auto-injection if content script was not already loaded on open tab
          if (chrome.scripting && tab.id) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js'],
              });
              const retryResponse = await chrome.tabs.sendMessage(tab.id, { type: 'PHERO_CHECK_STATE' });
              if (retryResponse?.state) {
                setState(retryResponse.state);
              }
            } catch {
              // Ignore
            }
          }
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
      } catch (sendErr) {
        // If content script was disconnected or not loaded, dynamically inject it and retry
        if (chrome.scripting) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          // Small delay for script mount
          await new Promise((r) => setTimeout(r, 100));
          response = await chrome.tabs.sendMessage(tab.id, {
            type: 'PHERO_TRIGGER_HANDOFF',
            destinationProvider: dest,
          });
        } else {
          throw sendErr;
        }
      }

      if (response && response.success) {
        setTransferSuccess(true);
        setTimeout(() => {
          window.close();
        }, 1200);
      } else {
        throw new Error(response?.error || 'No active messages found in this chat.');
      }
    } catch (err) {
      Logger.error('Error triggering handoff from popup', err);
      const msg = err instanceof Error ? err.message : 'Transfer could not be initiated.';
      if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
        setErrorText('Please refresh the ChatGPT page once to connect PHERO.');
      } else {
        setErrorText(msg);
      }
      setTransferring(false);
    }
  };

  return (
    <div className="w-72 bg-zinc-950 text-zinc-100 p-4 font-sans antialiased select-none border border-zinc-800 rounded-xl shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <PheroLogo size={14} />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-tight text-white">PHERO</h1>
            <p className="text-[10px] text-zinc-500">Carry the conversation forward</p>
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-6 flex items-center justify-center text-zinc-500 gap-2 text-xs">
          <SpinnerIcon size={14} />
          <span>Detecting workspace…</span>
        </div>
      ) : !providerId ? (
        <div className="py-4 text-center">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Open a <span className="text-emerald-400 font-medium">ChatGPT</span> or{' '}
            <span className="text-amber-400 font-medium">Claude</span> conversation to carry it forward.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between bg-zinc-900/70 border border-zinc-800/80 rounded-lg px-2.5 py-2 mb-3">
            <div className="flex items-center gap-2">
              {providerId === 'chatgpt' ? <ChatGPTLogo size={15} /> : <ClaudeLogo size={15} />}
              <span className="text-xs font-semibold text-zinc-200">
                {providerId === 'chatgpt' ? 'ChatGPT' : 'Claude'}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              {state?.isInConversation ? 'Chat Active' : 'Ready'}
            </span>
          </div>

          <div className="text-[11px] font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            Continue in
          </div>

          <div className="space-y-1">
            {providerId !== 'claude' && (
              <button
                onClick={() => handleTriggerHandoff('claude')}
                disabled={transferring}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 transition-all cursor-pointer group"
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
                  <span className="text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all text-xs">
                    →
                  </span>
                )}
              </button>
            )}

            {providerId !== 'chatgpt' && (
              <button
                onClick={() => handleTriggerHandoff('chatgpt')}
                disabled={transferring}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 transition-all cursor-pointer group"
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
                  <span className="text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all text-xs">
                    →
                  </span>
                )}
              </button>
            )}
          </div>

          {errorText && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg leading-snug">
              <AlertIcon size={14} className="shrink-0" />
              <span>{errorText}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-2.5 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-600">
        <span>100% Local · Privacy-first</span>
        <span>v0.1.0</span>
      </div>
    </div>
  );
};
