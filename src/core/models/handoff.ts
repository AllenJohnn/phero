import { NormalizedConversation, ProviderId } from './conversation.ts';

export type HandoffStatus =
  | 'idle'
  | 'preparing'
  | 'extracting'
  | 'completeness_warning'
  | 'building_context'
  | 'opening_destination'
  | 'waiting_for_editor'
  | 'injecting'
  | 'ready'
  | 'failed';

export type HandoffPayload = {
  handoffId: string;
  sourceProvider: ProviderId;
  destinationProvider: ProviderId;
  conversation: NormalizedConversation;
  continuationPrompt: string;
  createdAt: number;
  expiresAt: number; // TTL (e.g. 5 minutes from creation)
  status: HandoffStatus;
  error?: string;
  isCompletenessVerified: boolean;
  totalMessagesExtracted: number;
};

export type HandoffResult = {
  success: boolean;
  handoffId: string;
  error?: string;
  needsFallbackCopy?: boolean;
};
