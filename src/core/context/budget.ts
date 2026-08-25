import { NormalizedMessage, CodeBlock } from '../models/conversation.ts';

export type BudgetConfig = {
  maxCharacters: number; // Approximate safety threshold (e.g. 24,000 chars ~ 6,000 tokens)
  verbatimRecentTurnsCount: number; // Keep last 4–6 turns 100% intact
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxCharacters: 32000,
  verbatimRecentTurnsCount: 6,
};

export type PartitionedMessages = {
  recentMessages: NormalizedMessage[];
  earlierMessages: NormalizedMessage[];
  extractedCodeBlocks: CodeBlock[];
  extractedConstraints: string[];
};

/**
 * Partitions a message history into recent verbatim messages,
 * earlier summary context, and extracted code blocks respecting the budget.
 */
export function partitionConversation(
  messages: NormalizedMessage[],
  config: BudgetConfig = DEFAULT_BUDGET_CONFIG
): PartitionedMessages {
  if (messages.length === 0) {
    return {
      recentMessages: [],
      earlierMessages: [],
      extractedCodeBlocks: [],
      extractedConstraints: [],
    };
  }

  const recentCount = Math.min(messages.length, config.verbatimRecentTurnsCount);
  const splitIndex = messages.length - recentCount;

  const earlierMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Extract critical code blocks from earlier messages so they are not lost
  const extractedCodeBlocks: CodeBlock[] = [];
  const extractedConstraints: string[] = [];

  for (const msg of earlierMessages) {
    for (const block of msg.content) {
      if (block.type === 'code' && block.code.trim().length > 0) {
        // Keep unique code blocks
        if (!extractedCodeBlocks.some((b) => b.code.trim() === block.code.trim())) {
          extractedCodeBlocks.push(block);
        }
      } else if (block.type === 'text') {
        // Look for explicit constraints or requirements
        const lines = block.text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^(require|must|constraint|rule|goal|instruction|note):/i.test(trimmed)) {
            extractedConstraints.push(trimmed);
          }
        }
      }
    }
  }

  return {
    recentMessages,
    earlierMessages,
    extractedCodeBlocks,
    extractedConstraints,
  };
}
