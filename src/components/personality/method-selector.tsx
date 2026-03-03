"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Twitter, HelpCircle, FileText, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const methods = [
  {
    id: "scrape" as const,
    title: "Analyze X Posts",
    description:
      "We'll scrape your existing tweets and build a personality profile from real content. Recommended for best results.",
    icon: Twitter,
    recommended: true,
  },
  {
    id: "quiz" as const,
    title: "Take a Quiz",
    description:
      "Answer 10 questions about your communication style to generate your voice profile.",
    icon: HelpCircle,
    recommended: false,
  },
  {
    id: "freetext" as const,
    title: "Describe Yourself",
    description:
      "Write a free-form description of how you want the agent to sound.",
    icon: FileText,
    recommended: false,
  },
  {
    id: "hybrid" as const,
    title: "Combine Methods",
    description:
      "Mix and match any of the above methods for the most accurate profile.",
    icon: Layers,
    recommended: false,
  },
];

export type PersonalityMethod = (typeof methods)[number]["id"];

export function MethodSelector({
  selected,
  onSelect,
}: {
  selected: PersonalityMethod | null;
  onSelect: (method: PersonalityMethod) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {methods.map((method) => (
        <Card
          key={method.id}
          className={cn(
            "cursor-pointer transition-colors hover:border-primary/50",
            selected === method.id && "border-primary ring-1 ring-primary"
          )}
          onClick={() => onSelect(method.id)}
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <method.icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {method.title}
                  {method.recommended && (
                    <span className="ml-2 text-xs font-normal text-primary">
                      Recommended
                    </span>
                  )}
                </CardTitle>
              </div>
            </div>
            <CardDescription className="mt-2">
              {method.description}
            </CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
