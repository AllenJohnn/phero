import React from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { ClaudeLogo, ChatGPTLogo } from '../icons/index.tsx';

export type QuickSwitcherProps = {
  sourceProvider: ProviderId;
  onSelectDestination: (dest: ProviderId) => void;
  onClose: () => void;
};

export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  sourceProvider,
  onSelectDestination,
  onClose,
}) => {
  const destinations: { id: ProviderId; name: string; icon: React.ReactNode; color: string }[] = [];

  if (sourceProvider !== 'claude') {
    destinations.push({
      id: 'claude',
      name: 'Claude',
      icon: <ClaudeLogo size={16} />,
      color: '#D97706',
    });
  }

  if (sourceProvider !== 'chatgpt') {
    destinations.push({
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: <ChatGPTLogo size={16} />,
      color: '#10A37F',
    });
  }

  return (
    <div
      className="absolute bottom-12 right-0 w-56 rounded-xl border border-zinc-800 bg-zinc-950/95 p-1.5 text-zinc-100 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 z-50 font-sans select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800/80 mb-1">
        <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
          Continue in...
        </span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs px-1 rounded transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-0.5">
        {destinations.map((dest) => (
          <button
            key={dest.id}
            onClick={() => onSelectDestination(dest.id)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-200 hover:bg-zinc-800/80 hover:text-white transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-center w-5 h-5 rounded bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700">
              {dest.icon}
            </div>
            <span className="flex-1 font-semibold">{dest.name}</span>
            <span className="text-zinc-500 text-[11px] group-hover:translate-x-0.5 transition-transform">
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
