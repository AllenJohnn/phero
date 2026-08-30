import React, { useEffect, useState } from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { PheroLogo, ClaudeLogo, ChatGPTLogo, GeminiLogo, TransitArrow, SpinnerIcon, CheckIcon, AlertIcon } from '../icons/index.tsx';
import { Logger } from '../../shared/logger.ts';

export const Popup: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [pendingDest, setPendingDest] = useState<ProviderId | null>(null);
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
        } else if (url.hostname.includes('gemini.google.com') || url.hostname.includes('bard.google.com')) {
          setProviderId('gemini');
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
      setPendingDest(dest);
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
        // Dynamic re-injection fallback
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
      setPendingDest(null);
    }
  };

  const getProviderBadge = () => {
    if (providerId === 'chatgpt') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#141416] border border-[#232326] text-[11px] text-[#A1A1AA] font-medium tracking-tight">
          <span>ChatGPT</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#10A37F]" />
        </div>
      );
    }
    if (providerId === 'claude') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#141416] border border-[#232326] text-[11px] text-[#A1A1AA] font-medium tracking-tight">
          <span>Claude</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
        </div>
      );
    }
    if (providerId === 'gemini') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#141416] border border-[#232326] text-[11px] text-[#A1A1AA] font-medium tracking-tight">
          <span>Gemini</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#1A73E8]" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-[260px] bg-[#09090B] text-[#F4F4F6] p-3.5 font-sans antialiased select-none border border-[#232326] rounded-xl shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1E1E22]">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center text-[#3B82F6]">
            <PheroLogo size={16} />
          </div>
          <span className="text-[13px] font-bold tracking-tight text-[#F4F4F6]">
            PHERO
          </span>
        </div>
        {getProviderBadge()}
      </div>

      {/* Main Container */}
      {loading ? (
        <div className="py-4 flex items-center justify-center text-[#71717A] gap-2 text-xs">
          <SpinnerIcon size={13} className="text-[#3B82F6]" />
          <span>Detecting workspace…</span>
        </div>
      ) : !providerId ? (
        <div className="py-3 px-1 text-center text-xs text-[#8A8A93] leading-relaxed">
          Open a ChatGPT, Claude, or Gemini tab to carry it forward.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-[#8A8A93] px-0.5 mb-1">
            Continue in
          </div>

          {providerId !== 'claude' && (
            <button
              onClick={() => handleTriggerHandoff('claude')}
              disabled={transferring}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#111113] border border-[#232326] hover:bg-[#18181B] hover:border-[#36363A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 transition-all duration-150 cursor-pointer group text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-4 h-4">
                  <ClaudeLogo size={15} />
                </div>
                <span className="text-xs font-medium text-[#F4F4F6]">
                  Claude
                </span>
              </div>
              {transferring && pendingDest === 'claude' ? (
                <SpinnerIcon size={13} className="text-[#D97706]" />
              ) : transferSuccess && pendingDest === 'claude' ? (
                <CheckIcon size={13} className="text-[#10A37F]" />
              ) : (
                <TransitArrow
                  size={13}
                  className="text-[#52525B] group-hover:text-[#D4D4D8] group-hover:translate-x-0.5 transition-all duration-150"
                />
              )}
            </button>
          )}

          {providerId !== 'gemini' && (
            <button
              onClick={() => handleTriggerHandoff('gemini')}
              disabled={transferring}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#111113] border border-[#232326] hover:bg-[#18181B] hover:border-[#36363A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 transition-all duration-150 cursor-pointer group text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-4 h-4">
                  <GeminiLogo size={15} />
                </div>
                <span className="text-xs font-medium text-[#F4F4F6]">
                  Gemini
                </span>
              </div>
              {transferring && pendingDest === 'gemini' ? (
                <SpinnerIcon size={13} className="text-[#1A73E8]" />
              ) : transferSuccess && pendingDest === 'gemini' ? (
                <CheckIcon size={13} className="text-[#10A37F]" />
              ) : (
                <TransitArrow
                  size={13}
                  className="text-[#52525B] group-hover:text-[#D4D4D8] group-hover:translate-x-0.5 transition-all duration-150"
                />
              )}
            </button>
          )}

          {providerId !== 'chatgpt' && (
            <button
              onClick={() => handleTriggerHandoff('chatgpt')}
              disabled={transferring}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#111113] border border-[#232326] hover:bg-[#18181B] hover:border-[#36363A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 transition-all duration-150 cursor-pointer group text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-4 h-4">
                  <ChatGPTLogo size={15} />
                </div>
                <span className="text-xs font-medium text-[#F4F4F6]">
                  ChatGPT
                </span>
              </div>
              {transferring && pendingDest === 'chatgpt' ? (
                <SpinnerIcon size={13} className="text-[#10A37F]" />
              ) : transferSuccess && pendingDest === 'chatgpt' ? (
                <CheckIcon size={13} className="text-[#10A37F]" />
              ) : (
                <TransitArrow
                  size={13}
                  className="text-[#52525B] group-hover:text-[#D4D4D8] group-hover:translate-x-0.5 transition-all duration-150"
                />
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
