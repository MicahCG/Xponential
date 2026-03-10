"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PersonalityProfile } from "@/lib/personality/types";

export function ProfileDisplay({
  profile,
  method,
}: {
  profile: PersonalityProfile;
  method?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Your Personality Profile</CardTitle>
          {method && (
            <Badge variant="outline" className="capitalize">
              {method}
            </Badge>
          )}
        </div>
        <CardDescription>
          This profile is used to generate content that sounds like you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Tone</h4>
            <p className="mt-1">{profile.tone}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Humor Style
            </h4>
            <p className="mt-1">{profile.humor_style}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Formality
            </h4>
            <p className="mt-1">{profile.formality}/10</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Emoji Usage
            </h4>
            <p className="mt-1 capitalize">{profile.emoji_usage}</p>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Vocabulary Notes
          </h4>
          <p className="mt-1 text-sm">{profile.vocabulary_notes}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Cultural References
          </h4>
          <p className="mt-1 text-sm">{profile.cultural_references}</p>
        </div>

        {(profile.sample_phrases?.length ?? 0) > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Sample Phrases
            </h4>
            <div className="flex flex-wrap gap-2">
              {(profile.sample_phrases ?? []).map((phrase, i) => (
                <Badge key={i} variant="secondary">
                  &ldquo;{phrase}&rdquo;
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(profile.avoid_patterns?.length ?? 0) > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Avoid Patterns
            </h4>
            <div className="flex flex-wrap gap-2">
              {(profile.avoid_patterns ?? []).map((pattern, i) => (
                <Badge key={i} variant="destructive" className="font-normal">
                  {pattern}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
