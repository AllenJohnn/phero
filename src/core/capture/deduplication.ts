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
 * Deduplicates messages collected across multiple virtualized scroll windows.
 * Priority of deduplication:
 * 1. Stable explicit message ID (e.g. node UUID or provider data-testid id)
 * 2. Combined role + exact content fingerprint
 *
 * Preserves chronological order (oldest to newest).
 */
export function deduplicateMessages(
  existingMessages: NormalizedMessage[],
  incomingMessages: NormalizedMessage[]
): NormalizedMessage[] {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const merged: NormalizedMessage[] = [];

  // Combine lists: existing first, then incoming
  const allMessages = [...existingMessages, ...incomingMessages];

  for (const msg of allMessages) {
    const hasMeaningfulId = msg.id && !msg.id.startsWith('temp-') && !msg.id.startsWith('turn-fallback-');
    const fingerprint = computeContentFingerprint(msg);

    if (hasMeaningfulId) {
      if (seenIds.has(msg.id)) {
        continue;
      }
      seenIds.add(msg.id);
    } else {
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
    }

    seenFingerprints.add(fingerprint);
    merged.push(msg);
  }

  return merged;
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
