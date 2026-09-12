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
export function deduplicateMessagesWithAudit(firstBatch, secondBatch) {
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const merged = [];
  let skippedDuplicateIdCount = 0;
  let skippedDuplicateFingerprintCount = 0;
  let stableIdCount = 0;
  let fallbackIdCount = 0;
  const allMessages = [...firstBatch, ...secondBatch];
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
      totalFirstBatch: firstBatch.length,
      totalSecondBatch: secondBatch.length,
      retainedCount: merged.length,
      skippedDuplicateIdCount,
      skippedDuplicateFingerprintCount,
      stableIdCount,
      fallbackIdCount
    }
  };
}
export function deduplicateMessages(firstBatch, secondBatch) {
  return deduplicateMessagesWithAudit(firstBatch, secondBatch).messages;
}
export function reindexMessages(messages) {
  return messages.map((msg, index) => ({
    ...msg,
    id: msg.id || `msg-${index + 1}`
  }));
}