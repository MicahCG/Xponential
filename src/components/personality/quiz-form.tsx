"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QUIZ_QUESTIONS } from "@/lib/personality/quiz";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { PersonalityProfile } from "@/lib/personality/types";

export function QuizForm({
  onComplete,
}: {
  onComplete: (profile: PersonalityProfile) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = QUIZ_QUESTIONS[currentIndex];
  const isLast = currentIndex === QUIZ_QUESTIONS.length - 1;
  const progress = ((currentIndex + 1) / QUIZ_QUESTIONS.length) * 100;

  const handleSelect = (value: string | number) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const handleNext = async () => {
    if (!isLast) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const formattedAnswers = Object.entries(answers).map(
        ([questionId, value]) => ({ questionId, value })
      );

      const res = await fetch("/api/personality/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: formattedAnswers }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze quiz");
        return;
      }

      onComplete(data.profile);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="text-sm text-muted-foreground">
        Question {currentIndex + 1} of {QUIZ_QUESTIONS.length}
      </div>

      <h3 className="text-lg font-medium">{question.question}</h3>

      {question.type === "single-select" && (
        <div className="space-y-2">
          {question.options?.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                answers[question.id] === option.value &&
                  "border-primary bg-primary/5"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {question.type === "scale" && (
        <div className="space-y-3">
          <input
            type="range"
            min={question.min}
            max={question.max}
            value={(answers[question.id] as number) ?? 5}
            onChange={(e) => handleSelect(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{question.minLabel}</span>
            <span className="font-medium text-foreground">
              {answers[question.id] ?? 5}
            </span>
            <span>{question.maxLabel}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {currentIndex > 0 && (
          <Button
            variant="outline"
            onClick={() => setCurrentIndex((prev) => prev - 1)}
          >
            Back
          </Button>
        )}
        <Button
          onClick={handleNext}
          disabled={!answers[question.id] || loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : isLast ? (
            "Finish & Analyze"
          ) : (
            "Next"
          )}
        </Button>
      </div>
    </div>
  );
}
