export interface QuizQuestion {
  id: string;
  question: string;
  type: "single-select" | "scale";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "tone",
    question: "How would you describe your typical online voice?",
    type: "single-select",
    options: [
      { value: "professional", label: "Professional and polished" },
      { value: "casual", label: "Casual and conversational" },
      { value: "witty", label: "Witty and clever" },
      { value: "passionate", label: "Passionate and opinionated" },
      { value: "educational", label: "Educational and informative" },
    ],
  },
  {
    id: "humor",
    question: "What best describes your humor style?",
    type: "single-select",
    options: [
      { value: "dry", label: "Dry and deadpan" },
      { value: "sarcastic", label: "Sarcastic and sharp" },
      { value: "wholesome", label: "Wholesome and uplifting" },
      { value: "meme-heavy", label: "Meme-heavy and internet-brained" },
      { value: "minimal", label: "I don't really do humor" },
    ],
  },
  {
    id: "formality",
    question: "How formal is your writing style?",
    type: "scale",
    min: 1,
    max: 10,
    minLabel: "Very casual (lowercase, slang)",
    maxLabel: "Very formal (proper grammar, no contractions)",
  },
  {
    id: "emoji",
    question: "How much do you use emojis?",
    type: "single-select",
    options: [
      { value: "none", label: "Never — text only" },
      { value: "light", label: "Occasionally — one or two per post" },
      { value: "moderate", label: "Regularly — most posts have some" },
      { value: "heavy", label: "Liberally — emojis everywhere" },
    ],
  },
  {
    id: "hot_takes",
    question: "How comfortable are you with hot takes?",
    type: "single-select",
    options: [
      { value: "never", label: "I avoid controversy entirely" },
      { value: "mild", label: "I'll gently challenge consensus" },
      { value: "moderate", label: "I'll share unpopular opinions" },
      { value: "spicy", label: "I love stirring the pot" },
    ],
  },
  {
    id: "topics",
    question: "What topics do you mainly engage with?",
    type: "single-select",
    options: [
      { value: "tech", label: "Tech and engineering" },
      { value: "ai", label: "AI and machine learning" },
      { value: "startups", label: "Startups and business" },
      { value: "culture", label: "Pop culture and entertainment" },
      { value: "mixed", label: "A broad mix of everything" },
    ],
  },
  {
    id: "references",
    question: "What kind of cultural references do you use?",
    type: "single-select",
    options: [
      { value: "tech-only", label: "Only tech and industry references" },
      { value: "tech-pop", label: "Tech + pop culture" },
      { value: "sports-tech", label: "Sports + tech" },
      { value: "everything", label: "Everything — movies, music, memes, sports" },
    ],
  },
  {
    id: "length",
    question: "How long are your typical posts?",
    type: "single-select",
    options: [
      { value: "short", label: "Short and punchy (1-2 sentences)" },
      { value: "medium", label: "Medium (3-4 sentences)" },
      { value: "long", label: "Long and detailed (threads, paragraphs)" },
    ],
  },
  {
    id: "engagement_style",
    question: "How do you typically engage with others?",
    type: "single-select",
    options: [
      { value: "supportive", label: "Supportive and encouraging" },
      { value: "debate", label: "I enjoy healthy debate" },
      { value: "informative", label: "I add context and information" },
      { value: "humorous", label: "I try to make people laugh" },
    ],
  },
  {
    id: "vocabulary",
    question: "Which best describes your vocabulary?",
    type: "single-select",
    options: [
      { value: "simple", label: "Simple and accessible" },
      { value: "technical", label: "Technical and jargon-heavy" },
      { value: "creative", label: "Creative and expressive" },
      { value: "concise", label: "Concise and no-nonsense" },
    ],
  },
];

export function formatQuizForAnalysis(
  answers: { questionId: string; value: string | number }[]
): string {
  const lines = answers.map((answer) => {
    const question = QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) return null;

    let answerLabel: string;
    if (question.type === "scale") {
      answerLabel = `${answer.value}/10`;
    } else {
      const option = question.options?.find(
        (o) => o.value === String(answer.value)
      );
      answerLabel = option?.label ?? String(answer.value);
    }

    return `- ${question.question}: ${answerLabel}`;
  });

  return lines.filter(Boolean).join("\n");
}
