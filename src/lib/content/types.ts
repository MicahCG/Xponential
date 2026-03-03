export interface GenerateRequest {
  platform: "x" | "linkedin";
  postType: "reply" | "quote" | "original";
  targetPostUrl?: string;
  targetPostContent?: string;
  targetAuthor?: string;
  topic?: string;
  additionalContext?: string;
  count?: number;
}

export interface GeneratedContent {
  content: string;
  reasoning: string;
  platform: "x" | "linkedin";
  postType: "reply" | "quote" | "original";
  characterCount: number;
}
