import { NormalizedMessage } from '../models/conversation.ts';

/**
 * Computes a fingerprint for content blocks within a message.
 */
export function computeContentFingerprint(msg: NormalizedMessage): string {
  const parts: string[] = [msg.role];
  for (const block of msg.content) {
    if (block.type === 'text') {
      parts.push(`t:${block.text.trim()}`);
    } else if (block.type === 'code') {
      parts.push(`c:${block.language || ''}:${block.code.trim()}`);
    }
  }
  return parts.join('|||');
}

/**
 * Checks whether an ID is a genuine, globally unique message ID rather than a relative slice index.
 */
export function isStableMessageId(id: string | undefined): boolean {
  if (!id) return false;
  if (id.startsWith('temp-') || id.startsWith('turn-fallback-') || id.startsWith('turn-dom-')) return false;
  if (id === 'conversation-turn' || id === 'chat-message') return false;
  return true;
}

export type DeduplicationAudit = {
  totalIncoming: number;
  totalExisting: number;
  retainedCount: number;
  skippedDuplicateIdCount: number;
  skippedDuplicateFingerprintCount: number;
  stableIdCount: number;
  fallbackIdCount: number;
};

export function deduplicateMessagesWithAudit(
  existingMessages: NormalizedMessage[],
  incomingMessages: NormalizedMessage[]
): { messages: NormalizedMessage[]; audit: DeduplicationAudit } {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const merged: NormalizedMessage[] = [];

  let skippedDuplicateIdCount = 0;
  let skippedDuplicateFingerprintCount = 0;
  let stableIdCount = 0;
  let fallbackIdCount = 0;

  const allMessages = [...existingMessages, ...incomingMessages];

  for (const msg of allMessages) {
    const hasMeaningfulId = isStableMessageId(msg.id);
    const fingerprint = computeContentFingerprint(msg);

    if (hasMeaningfulId) {
      stableIdCount++;
      if (seenIds.has(msg.id)) {
        skippedDuplicateIdCount++;
        continue;
      }
      seenIds.add(msg.id);
    } else {
      fallbackIdCount++;
      if (seenFingerprints.has(fingerprint)) {
        skippedDuplicateFingerprintCount++;
        continue;
      }
      seenFingerprints.add(fingerprint);
    }

    merged.push(msg);
  }

  return {
    messages: merged,
    audit: {
      totalIncoming: incomingMessages.length,
      totalExisting: existingMessages.length,
      retainedCount: merged.length,
      skippedDuplicateIdCount,
      skippedDuplicateFingerprintCount,
      stableIdCount,
      fallbackIdCount,
    },
  };
}

export function deduplicateMessages(
  existingMessages: NormalizedMessage[],
  incomingMessages: NormalizedMessage[]
): NormalizedMessage[] {
  return deduplicateMessagesWithAudit(existingMessages, incomingMessages).messages;
}

/**
 * Ensures normalized messages are sequentially indexed and stable.
 */
export function reindexMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  return messages.map((msg, index) => ({
    ...msg,
    id: msg.id || `msg-${index + 1}`,
  }));
}
