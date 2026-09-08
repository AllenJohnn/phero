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

export type ImageBlock = {
  type: 'image';
  url: string;
  alt?: string;
};

export type FileBlock = {
  type: 'file';
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
};

export type ContentBlock = TextBlock | CodeBlock | ImageBlock | FileBlock;

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
