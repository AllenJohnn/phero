import { partitionConversation, getBudgetConfigForProvider } from './budget.js';
import { AdapterRegistry } from '../../adapters/registry.js';

export const CONTINUATION_HEADER_MARKER = 'You are continuing';
export function formatContentBlocks(blocks) {
  return blocks.map(block => {
    if (block.type === 'code') {
      const lang = block.language || '';
      return `\`\`\`${lang}\n${block.code}\n\`\`\``;
    }
    if (block.type === 'image') {
      return `[Image: ${block.alt || 'attachment'}] (${block.url})`;
    }
    if (block.type === 'file') {
      return `[File: ${block.name}]${block.url ? ` (${block.url})` : ''}`;
    }
    return block.text.trim();
  }).filter(Boolean).join('\n\n');
}
export function formatMessageTurn(msg) {
  const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
  const body = formatContentBlocks(msg.content);
  return `[${roleLabel}]:\n${body}`;
}
export function buildContinuationPrompt(conversation, options = {}) {
  const budgetConfig = options.budgetConfig || getBudgetConfigForProvider(options.destinationProvider);
  const messages = conversation.messages;
  if (messages.length === 0) {
    return `You are continuing an ongoing conversation transferred from another AI assistant.\n\nSource: ${conversation.sourceProvider}\n\nPlease ask how you can help continue the conversation.`;
  }
  const {
    recentMessages,
    earlierMessages,
    extractedCodeBlocks,
    extractedConstraints,
    extractedDecisions,
    extractedUnresolvedIssues
  } = partitionConversation(messages, budgetConfig);

  const sections = [];
  sections.push('You are continuing an ongoing conversation transferred from another AI assistant.\nThe user has moved this conversation here so they can continue working without losing context.');
  const registry = AdapterRegistry.getInstance();
  const providerDisplay = registry.getAdapter(conversation.sourceProvider)?.name || conversation.sourceProvider;
  let contextHeader = `=== CONTEXT ===\nSource: ${providerDisplay}`;
  if (conversation.title) {
    contextHeader += `\nTopic: ${conversation.title}`;
  }
  sections.push(contextHeader);
  const importantContextItems = [];
  if (extractedConstraints.length > 0) {
    importantContextItems.push('Project Requirements & Constraints:');
    for (const c of extractedConstraints.slice(0, 10)) {
      importantContextItems.push(`- ${c}`);
    }
  }
  if (extractedDecisions.length > 0) {
    if (importantContextItems.length > 0) importantContextItems.push('');
    importantContextItems.push('Key Decisions & Agreed Architecture:');
    for (const d of extractedDecisions.slice(0, 8)) {
      importantContextItems.push(`- ${d}`);
    }
  }
  if (extractedUnresolvedIssues.length > 0) {
    if (importantContextItems.length > 0) importantContextItems.push('');
    importantContextItems.push('Unresolved Issues & Blockers:');
    for (const issue of extractedUnresolvedIssues.slice(0, 6)) {
      importantContextItems.push(`- ${issue}`);
    }
  }
  if (earlierMessages.length > 0 && importantContextItems.length === 0) {
    importantContextItems.push(`Earlier discussion covered ${earlierMessages.length} prior turns establishing context and background.`);
  }
  if (importantContextItems.length > 0) {
    sections.push(`=== IMPORTANT CONTEXT ===\n${importantContextItems.join('\n')}`);
  }
  if (extractedCodeBlocks.length > 0) {
    const codeSections = [];
    for (let i = 0; i < Math.min(extractedCodeBlocks.length, 6); i++) {
      const b = extractedCodeBlocks[i];
      codeSections.push(`Code Reference ${i + 1} (${b.language || 'code'}):\n\`\`\`${b.language || ''}\n${b.code}\n\`\`\``);
    }
    sections.push(`=== PREVIOUS WORK ===\n${codeSections.join('\n\n')}`);
  }
  const baseSections = sections.join('\n\n');
  const recentTurnsFormatted = recentMessages.map(formatMessageTurn).join('\n\n---\n\n');
  const instructionsText = '=== INSTRUCTIONS ===\nContinue directly from where the previous assistant stopped.\nDo not restart the task.\nDo not ask the user to repeat information already provided.\nUse the supplied context as the working context for this conversation.';
  const mandatoryLength = baseSections.length + recentTurnsFormatted.length + instructionsText.length + 100;
  if (earlierMessages.length > 0) {
    let availableBudget = budgetConfig.maxCharacters - mandatoryLength;
    if (availableBudget > 1000) {
      const messagesToInclude = [];
      let omittedCount = 0;
      for (let i = 0; i < earlierMessages.length; i++) {
        const turnText = formatMessageTurn(earlierMessages[i]);
        if (availableBudget - turnText.length > 0 || i === 0) {
          messagesToInclude.push(turnText);
          availableBudget -= turnText.length + 10;
        } else {
          omittedCount = earlierMessages.length - i;
          break;
        }
      }
      let historySection = `=== CONVERSATION HISTORY ===\n`;
      historySection += messagesToInclude.join('\n\n---\n\n');
      if (omittedCount > 0) {
        historySection += `\n\n(Note: ${omittedCount} middle turns condensed due to context budget limits)`;
      }
      sections.push(historySection);
    } else {
      sections.push(`=== CONVERSATION HISTORY ===\n(Note: ${earlierMessages.length} earlier turns omitted due to context budget limits)`);
    }
  }
  sections.push(`=== RECENT CONVERSATION ===\n${recentTurnsFormatted}`);

  sections.push(instructionsText);
  return sections.join('\n\n');
}