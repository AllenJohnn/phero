export type ProviderId = 'chatgpt' | 'claude' | 'gemini';

export type Role = 'user' | 'assistant' | 'system';

export type TextBlock = {
  type: 'text';
  text: string;
};

export type CodeBlock = {
  type: 'code';
  language?: string;
  code: string;
};

export type ContentBlock = TextBlock | CodeBlock;

export type NormalizedMessage = {
  id: string;
  role: Role;
  content: ContentBlock[];
  timestamp?: number;
  authorName?: string;
};

export type NormalizedConversation = {
  id?: string;
  title?: string;
  sourceProvider: ProviderId;
  createdAt: number;
  messages: NormalizedMessage[];
  metadata?: {
    model?: string;
    url?: string;
    isTruncated?: boolean;
    totalDetectedTurns?: number;
    extractedTurns?: number;
  };
};
