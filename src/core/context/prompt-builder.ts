import { NormalizedConversation, NormalizedMessage, ContentBlock } from '../models/conversation.ts';
import { partitionConversation, BudgetConfig, DEFAULT_BUDGET_CONFIG } from './budget.ts';

export type PromptBuilderOptions = {
  budgetConfig?: BudgetConfig;
};

/**
 * Formats content blocks into clean markdown text without noise.
 */
export function formatContentBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'code') {
        const lang = block.language || '';
        return `\`\`\`${lang}\n${block.code}\n\`\`\``;
      }
      return block.text.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Formats a single message turn for the continuation prompt.
 */
export function formatMessageTurn(msg: NormalizedMessage): string {
  const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
  const body = formatContentBlocks(msg.content);
  return `[${roleLabel}]:\n${body}`;
}

/**
 * Builds a deterministic continuation prompt for the destination AI.
 */
export function buildContinuationPrompt(
  conversation: NormalizedConversation,
  options: PromptBuilderOptions = {}
): string {
  const budgetConfig = options.budgetConfig || DEFAULT_BUDGET_CONFIG;
  const messages = conversation.messages;

  if (messages.length === 0) {
    return `You are continuing an ongoing conversation transferred from another AI assistant.\n\nSource: ${conversation.sourceProvider}\n\nPlease ask how you can help continue the conversation.`;
  }

  const { recentMessages, earlierMessages, extractedCodeBlocks, extractedConstraints } =
    partitionConversation(messages, budgetConfig);

  // Find the last user request
  let lastUserMessage: NormalizedMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessage = messages[i];
      break;
    }
  }

  const sections: string[] = [];

  // Header
  sections.push(
    'You are continuing an ongoing conversation transferred from another AI assistant.\nThe user has moved this conversation here so they can continue working without losing context.'
  );

  // === CONTEXT ===
  const providerDisplay =
    conversation.sourceProvider === 'chatgpt'
      ? 'ChatGPT'
      : conversation.sourceProvider === 'claude'
      ? 'Claude'
      : 'Gemini';

  let contextHeader = `=== CONTEXT ===\nSource: ${providerDisplay}`;
  if (conversation.title) {
    contextHeader += `\nTopic: ${conversation.title}`;
  }
  sections.push(contextHeader);

  // === IMPORTANT CONTEXT === (Constraints & requirements)
  const importantContextItems: string[] = [];
  if (extractedConstraints.length > 0) {
    importantContextItems.push('Project Requirements & Constraints:');
    for (const c of extractedConstraints.slice(0, 10)) {
      importantContextItems.push(`- ${c}`);
    }
  }

  if (earlierMessages.length > 0 && importantContextItems.length === 0) {
    importantContextItems.push(
      `Earlier discussion covered ${earlierMessages.length} prior turns establishing context and background.`
    );
  }

  if (importantContextItems.length > 0) {
    sections.push(`=== IMPORTANT CONTEXT ===\n${importantContextItems.join('\n')}`);
  }

  // === PREVIOUS WORK === (Code blocks and key outputs from earlier in the chat)
  if (extractedCodeBlocks.length > 0) {
    const codeSections: string[] = [];
    for (let i = 0; i < Math.min(extractedCodeBlocks.length, 5); i++) {
      const b = extractedCodeBlocks[i];
      codeSections.push(`Code Reference ${i + 1} (${b.language || 'code'}):\n\`\`\`${b.language || ''}\n${b.code}\n\`\`\``);
    }
    sections.push(`=== PREVIOUS WORK ===\n${codeSections.join('\n\n')}`);
  }

  // === RECENT CONVERSATION ===
  const recentTurnsFormatted = recentMessages.map(formatMessageTurn).join('\n\n---\n\n');
  sections.push(`=== RECENT CONVERSATION ===\n${recentTurnsFormatted}`);

  // === CURRENT REQUEST ===
  if (lastUserMessage) {
    sections.push(`=== CURRENT REQUEST ===\n${formatContentBlocks(lastUserMessage.content)}`);
  }

  // === INSTRUCTIONS ===
  sections.push(
    '=== INSTRUCTIONS ===\n' +
    'Continue directly from where the previous assistant stopped.\n' +
    'Do not restart the task.\n' +
    'Do not ask the user to repeat information already provided.\n' +
    'Use the supplied context as the working context for this conversation.'
  );

  return sections.join('\n\n');
}
