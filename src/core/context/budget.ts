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
  extractedDecisions: string[];
  extractedUnresolvedIssues: string[];
};

/**
 * Partitions a message history into recent verbatim messages,
 * earlier summary context, extracted code blocks, decisions, and constraints respecting the budget.
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
      extractedDecisions: [],
      extractedUnresolvedIssues: [],
    };
  }

  const recentCount = Math.min(messages.length, config.verbatimRecentTurnsCount);
  const splitIndex = messages.length - recentCount;

  const earlierMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Extract critical code blocks from earlier messages so they are not lost
  const extractedCodeBlocks: CodeBlock[] = [];
  const extractedConstraints: string[] = [];
  const extractedDecisions: string[] = [];
  const extractedUnresolvedIssues: string[] = [];

  const seenConstraintKeys = new Set<string>();
  const seenDecisionKeys = new Set<string>();

  for (const msg of earlierMessages) {
    for (const block of msg.content) {
      if (block.type === 'code' && block.code.trim().length > 0) {
        // Keep unique code blocks
        if (!extractedCodeBlocks.some((b) => b.code.trim() === block.code.trim())) {
          extractedCodeBlocks.push(block);
        }
      } else if (block.type === 'text') {
        const lines = block.text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.length < 5) continue;

          // 1. Requirements & Constraints
          if (
            /^(require(ment)?|must|constraint|rule|goal|instruction|note|spec|acceptance criteria):/i.test(trimmed) ||
            /^-\s*(must|shall|should not|do not|never|always)\b/i.test(trimmed)
          ) {
            const clean = trimmed.replace(/^[-*•]\s*/, '').trim();
            const key = clean.toLowerCase();
            if (!seenConstraintKeys.has(key) && extractedConstraints.length < 12) {
              seenConstraintKeys.add(key);
              extractedConstraints.push(clean);
            }
          }

          // 2. Decisions & Architecture choices
          else if (
            /^(decision|we decided|agreed on|chosen approach|architecture choice|design):/i.test(trimmed) ||
            /\b(let's go with|we'll use|chosen to use|settled on)\b/i.test(trimmed)
          ) {
            const clean = trimmed.replace(/^[-*•]\s*/, '').trim();
            const key = clean.toLowerCase();
            if (!seenDecisionKeys.has(key) && extractedDecisions.length < 8) {
              seenDecisionKeys.add(key);
              extractedDecisions.push(clean);
            }
          }

          // 3. Unresolved issues or bugs mentioned earlier
          else if (
            /^(bug|error|issue|unresolved|todo|blocker|failure):/i.test(trimmed) ||
            /\b(fix needed|still failing|broken|exception encountered)\b/i.test(trimmed)
          ) {
            const clean = trimmed.replace(/^[-*•]\s*/, '').trim();
            if (extractedUnresolvedIssues.length < 6) {
              extractedUnresolvedIssues.push(clean);
            }
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
    extractedDecisions,
    extractedUnresolvedIssues,
  };
}
