import React from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { ClaudeLogo, ChatGPTLogo, GeminiLogo, TransitArrow } from '../icons/index.tsx';

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
  const destinations: { id: ProviderId; name: string; icon: React.ReactNode }[] = [];

  if (sourceProvider !== 'claude') {
    destinations.push({
      id: 'claude',
      name: 'Claude',
      icon: <ClaudeLogo size={15} />,
    });
  }

  if (sourceProvider !== 'gemini') {
    destinations.push({
      id: 'gemini',
      name: 'Gemini',
      icon: <GeminiLogo size={15} />,
    });
  }

  if (sourceProvider !== 'chatgpt') {
    destinations.push({
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: <ChatGPTLogo size={15} />,
    });
  }

  return (
    <div
      className="absolute bottom-11 right-0 w-52 rounded-xl border border-[#232326] bg-[#09090B]/95 p-1.5 text-[#F4F4F6] shadow-2xl backdrop-blur-md z-50 font-sans select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#1E1E22] mb-1">
        <span className="text-[11px] font-medium text-[#8A8A93]">
          Continue in
        </span>
        <button
          onClick={onClose}
          className="text-[#52525B] hover:text-[#D4D4D8] text-xs px-1 rounded transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1">
        {destinations.map((dest) => (
          <button
            key={dest.id}
            onClick={() => onSelectDestination(dest.id)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-[#EDEDEF] bg-[#111113] hover:bg-[#18181B] border border-[#232326] hover:border-[#36363A] transition-all duration-150 text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                {dest.icon}
              </div>
              <span className="font-medium text-[#F4F4F6]">{dest.name}</span>
            </div>
            <TransitArrow
              size={12}
              className="text-[#52525B] group-hover:text-[#EDEDEF] group-hover:translate-x-0.5 transition-all duration-150"
            />
          </button>
        ))}
      </div>
    </div>
  );
};
