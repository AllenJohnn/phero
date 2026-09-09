export function computeContentFingerprint(msg) {
  const parts = [msg.role];
  for (const block of msg.content) {
    if (block.type === 'text') {
      parts.push(`t:${block.text.trim()}`);
    } else if (block.type === 'code') {
      parts.push(`c:${block.language || ''}:${block.code.trim()}`);
    }
  }
  return parts.join('|||');
}
export function isStableMessageId(id) {
  if (!id) return false;
  if (id.startsWith('temp-') || id.startsWith('turn-fallback-') || id.startsWith('turn-dom-')) return false;
  if (id === 'conversation-turn' || id === 'chat-message') return false;
  return true;
}
export function deduplicateMessagesWithAudit(existingMessages, incomingMessages) {
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const merged = [];
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
      fallbackIdCount
    }
  };
}
export function deduplicateMessages(existingMessages, incomingMessages) {
  return deduplicateMessagesWithAudit(existingMessages, incomingMessages).messages;
}
export function reindexMessages(messages) {
  return messages.map((msg, index) => ({
    ...msg,
    id: msg.id || `msg-${index + 1}`
  }));
}