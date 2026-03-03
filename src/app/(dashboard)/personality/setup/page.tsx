"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  MethodSelector,
  type PersonalityMethod,
} from "@/components/personality/method-selector";
import { ScrapeForm } from "@/components/personality/scrape-form";
import { QuizForm } from "@/components/personality/quiz-form";
import { FreetextForm } from "@/components/personality/freetext-form";
import { ProfileDisplay } from "@/components/personality/profile-display";
import type { PersonalityProfile } from "@/lib/personality/types";

export default function PersonalitySetupPage() {
  const router = useRouter();
  const [method, setMethod] = useState<PersonalityMethod | null>(null);
  const [result, setResult] = useState<PersonalityProfile | null>(null);

  if (result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Profile Created!
          </h1>
          <p className="text-muted-foreground">
            Your personality profile has been saved. You can now generate
            content.
          </p>
        </div>
        <ProfileDisplay profile={result} method={method ?? undefined} />
        <div className="flex gap-2">
          <Button onClick={() => router.push("/personality")}>
            View Profile
          </Button>
          <Button variant="outline" onClick={() => router.push("/content")}>
            Generate Content
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Set Up Your Personality
        </h1>
        <p className="text-muted-foreground">
          Choose how you&apos;d like to build your voice profile
        </p>
      </div>

      {!method ? (
        <MethodSelector selected={method} onSelect={setMethod} />
      ) : (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMethod(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Choose a different method
          </Button>

          {method === "scrape" && <ScrapeForm onComplete={setResult} />}
          {method === "quiz" && <QuizForm onComplete={setResult} />}
          {method === "freetext" && <FreetextForm onComplete={setResult} />}
          {method === "hybrid" && (
            <div className="text-sm text-muted-foreground">
              <p>
                The hybrid method lets you combine scraping, quiz, and freetext
                inputs for the most accurate profile. For Phase 1, please use one
                of the individual methods. Hybrid support is coming soon.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setMethod(null)}
              >
                Choose Another Method
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
