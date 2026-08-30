import React from 'react';
import { ProviderId } from '../../core/models/conversation.ts';
import { ClaudeLogo, ChatGPTLogo, GeminiLogo, TransitArrow } from '../icons/index.tsx';
import { AdapterRegistry } from '../../adapters/registry.ts';

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
  const registry = AdapterRegistry.getInstance();
  const currentAdapter = registry.getAdapter(sourceProvider);
  const destinations = currentAdapter
    ? currentAdapter.supportedDestinations.map(id => registry.getAdapter(id)!).filter(Boolean)
    : [];

  const getIcon = (id: ProviderId) => {
    switch(id) {
      case 'claude': return <ClaudeLogo size={15} />;
      case 'chatgpt': return <ChatGPTLogo size={15} />;
      case 'gemini': return <GeminiLogo size={15} />;
      default: return null;
    }
  };

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
        {destinations.map((destAdapter) => (
          <button
            key={destAdapter.id}
            onClick={() => onSelectDestination(destAdapter.id)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-[#EDEDEF] bg-[#111113] hover:bg-[#18181B] border border-[#232326] hover:border-[#36363A] transition-all duration-150 text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                {getIcon(destAdapter.id)}
              </div>
              <span className="font-medium text-[#F4F4F6]">{destAdapter.name}</span>
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
