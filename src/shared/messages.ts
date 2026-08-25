import { HandoffPayload, HandoffStatus } from '../core/models/handoff.ts';
import { ConversationState } from '../adapters/types.ts';
import { ProviderId } from '../core/models/conversation.ts';

export type MessageType =
  | 'PHERO_CHECK_STATE'
  | 'PHERO_STATE_RESPONSE'
  | 'PHERO_START_HANDOFF'
  | 'PHERO_GET_PENDING_HANDOFF'
  | 'PHERO_PENDING_HANDOFF_RESPONSE'
  | 'PHERO_TRIGGER_HANDOFF'
  | 'PHERO_UPDATE_STATUS'
  | 'PHERO_CLEAR_HANDOFF'
  | 'PHERO_COPY_FALLBACK';

export type CheckStateMessage = {
  type: 'PHERO_CHECK_STATE';
};

export type StateResponseMessage = {
  type: 'PHERO_STATE_RESPONSE';
  providerId: ProviderId | null;
  state: ConversationState;
};

export type TriggerHandoffMessage = {
  type: 'PHERO_TRIGGER_HANDOFF';
  destinationProvider: ProviderId;
};

export type StartHandoffMessage = {
  type: 'PHERO_START_HANDOFF';
  sourceProvider: ProviderId;
  destinationProvider: ProviderId;
  payload: HandoffPayload;
};

export type GetPendingHandoffMessage = {
  type: 'PHERO_GET_PENDING_HANDOFF';
  destinationProvider: ProviderId;
};

export type PendingHandoffResponseMessage = {
  type: 'PHERO_PENDING_HANDOFF_RESPONSE';
  handoff: HandoffPayload | null;
};

export type UpdateStatusMessage = {
  type: 'PHERO_UPDATE_STATUS';
  handoffId: string;
  status: HandoffStatus;
  error?: string;
};

export type ClearHandoffMessage = {
  type: 'PHERO_CLEAR_HANDOFF';
  handoffId: string;
};

export type CopyFallbackMessage = {
  type: 'PHERO_COPY_FALLBACK';
  prompt: string;
};

export type PheroMessage =
  | CheckStateMessage
  | StateResponseMessage
  | TriggerHandoffMessage
  | StartHandoffMessage
  | GetPendingHandoffMessage
  | PendingHandoffResponseMessage
  | UpdateStatusMessage
  | ClearHandoffMessage
  | CopyFallbackMessage;

