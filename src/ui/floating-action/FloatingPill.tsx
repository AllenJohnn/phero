import React, { useState, useEffect } from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { HandoffPayload, HandoffStatus } from '../../core/models/handoff.ts';
import { AdapterRegistry } from '../../adapters/registry.ts';
import { buildContinuationPrompt } from '../../core/context/prompt-builder.ts';
import { QuickSwitcher } from './QuickSwitcher.tsx';
import { PheroLogo, SpinnerIcon, CheckIcon, AlertIcon, CopyIcon } from '../icons/index.tsx';
import { Logger } from '../../shared/logger.ts';

export type FloatingPillProps = {
  sourceProvider: ProviderId;
};

export const FloatingPill: React.FC<FloatingPillProps> = ({ sourceProvider }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<HandoffStatus>('idle');
  const [statusText, setStatusText] = useState<string>('');
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [pendingDestination, setPendingDestination] = useState<ProviderId | null>(null);
  const [preparedPayload, setPreparedPayload] = useState<HandoffPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        if (status === 'completeness_warning') {
          setStatus('idle');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  const handleStartHandoff = async (destination: ProviderId, forceContinue = false) => {
    try {
      setIsOpen(false);
      setPendingDestination(destination);
      setStatus('extracting');
      setStatusText('Preparing conversation…');

      const registry = AdapterRegistry.getInstance();
      const adapter = registry.getAdapter(sourceProvider);

      if (!adapter) {
        throw new Error(`Source provider adapter not found: ${sourceProvider}`);
      }

      // Extract conversation
      const extraction = await adapter.extractConversation(document);

      if (extraction.conversation.messages.length === 0) {
        setStatus('failed');
        setStatusText('No conversation messages found');
        setTimeout(() => setStatus('idle'), 3500);
        return;
      }

      // Check completeness
      if (!extraction.isComplete && !forceContinue) {
        setStatus('completeness_warning');
        setWarningMessage(extraction.warning || 'Some earlier messages may not be loaded in this view.');
        return;
      }

      // Build context & prompt
      setStatus('building_context');
      setStatusText('Building context…');

      const continuationPrompt = buildContinuationPrompt(extraction.conversation);

      const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const payload: HandoffPayload = {
        handoffId,
        sourceProvider,
        destinationProvider: destination,
        conversation: extraction.conversation,
        continuationPrompt,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
        status: 'opening_destination',
        isCompletenessVerified: extraction.isComplete,
        totalMessagesExtracted: extraction.totalTurnsDetected,
      };

      setPreparedPayload(payload);
      setStatus('opening_destination');
      setStatusText(`Opening ${destination === 'claude' ? 'Claude' : 'destination'}…`);

      // Dispatch to background script
      const response = await chrome.runtime.sendMessage({
        type: 'PHERO_START_HANDOFF',
        sourceProvider,
        destinationProvider: destination,
        payload,
      });

      if (response && response.success) {
        setStatus('ready');
        setStatusText('Conversation ready');
        setTimeout(() => {
          setStatus('idle');
          setWarningMessage(null);
          setPendingDestination(null);
        }, 3000);
      } else {
        throw new Error(response?.error || 'Failed to open destination tab');
      }
    } catch (err) {
      Logger.error('Handoff initiation error', err);
      setStatus('failed');
      setStatusText('Could not complete transfer');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const handleCopyPrompt = async () => {
    if (!preparedPayload?.continuationPrompt) return;
    try {
      await navigator.clipboard.writeText(preparedPayload.continuationPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[999999] font-sans antialiased select-none">
      {/* Completeness Warning Modal */}
      {status === 'completeness_warning' && (
        <div className="absolute bottom-12 right-0 w-80 rounded-xl border border-amber-500/30 bg-zinc-950 p-4 text-zinc-100 shadow-2xl backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5 mb-3">
            <div className="text-amber-400 mt-0.5">
              <AlertIcon size={18} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-100">History Completeness</h4>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                {warningMessage || 'Some earlier messages may not be loaded in the page view.'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
            <button
              onClick={() => {
                setStatus('idle');
                setWarningMessage(null);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingDestination) {
                  handleStartHandoff(pendingDestination, true);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              Continue anyway
            </button>
          </div>
        </div>
      )}

      {/* Quick Switcher dropdown */}
      {isOpen && status === 'idle' && (
        <QuickSwitcher
          sourceProvider={sourceProvider}
          onSelectDestination={(dest) => handleStartHandoff(dest)}
          onClose={() => setIsOpen(false)}
        />
      )}

      {/* Primary Pill Button */}
      <button
        onClick={() => {
          if (status === 'idle') {
            setIsOpen(!isOpen);
          } else if (status === 'failed' && preparedPayload) {
            handleCopyPrompt();
          }
        }}
        disabled={status === 'extracting' || status === 'building_context' || status === 'opening_destination'}
        className={`group flex items-center gap-2 px-3 py-2 rounded-full border shadow-lg transition-all duration-200 cursor-pointer ${
          status === 'idle'
            ? 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white shadow-zinc-950/50'
            : status === 'ready'
            ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200'
            : status === 'failed'
            ? 'bg-rose-950/80 border-rose-800/80 text-rose-200'
            : 'bg-zinc-900 border-zinc-700 text-zinc-300'
        }`}
      >
        <div className="flex items-center justify-center">
          {status === 'idle' && (
            <PheroLogo size={14} className="text-blue-400 group-hover:scale-110 transition-transform" />
          )}
          {(status === 'extracting' || status === 'building_context' || status === 'opening_destination') && (
            <SpinnerIcon size={14} className="text-blue-400" />
          )}
          {status === 'ready' && <CheckIcon size={14} className="text-emerald-400" />}
          {status === 'failed' && <AlertIcon size={14} className="text-rose-400" />}
        </div>

        <span className="text-xs font-semibold tracking-tight">
          {status === 'idle' ? 'Continue in…' : statusText}
        </span>

        {status === 'idle' && (
          <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-300 transition-colors">
            ↗
          </span>
        )}

        {status === 'failed' && preparedPayload && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleCopyPrompt();
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-rose-300 hover:text-white underline pl-1"
          >
            <CopyIcon size={12} />
            {copied ? 'Copied' : 'Copy prompt'}
          </div>
        )}
      </button>
    </div>
  );
};
