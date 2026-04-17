"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface GenerateResult {
  generated: {
    content: string;
    reasoning: string;
    characterCount: number;
  }[];
  queueItems: { id: string; content: string; status: string }[];
}

export function GenerateForm({
  onGenerated,
}: {
  onGenerated: (result: GenerateResult) => void;
}) {
  const [platform] = useState<"x">("x");
  const [postType, setPostType] = useState<"reply" | "quote" | "original">(
    "reply"
  );
  const [targetPostContent, setTargetPostContent] = useState("");
  const [targetAuthor, setTargetAuthor] = useState("");
  const [topic, setTopic] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          postType,
          targetPostContent: targetPostContent || undefined,
          targetAuthor: targetAuthor || undefined,
          topic: topic || undefined,
          additionalContext: additionalContext || undefined,
          count: 3,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate content");
        return;
      }

      onGenerated(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    postType === "original"
      ? topic.length > 0
      : targetPostContent.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Post Type</Label>
            <Select
              value={postType}
              onValueChange={(v) =>
                setPostType(v as "reply" | "quote" | "original")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reply">Reply</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="original">Original Post</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(postType === "reply" || postType === "quote") && (
          <>
            <div className="space-y-2">
              <Label htmlFor="targetContent">
                Target Post Content
              </Label>
              <Textarea
                id="targetContent"
                placeholder="Paste the content of the post you want to reply to or quote..."
                value={targetPostContent}
                onChange={(e) => setTargetPostContent(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetAuthor">Target Author</Label>
              <Input
                id="targetAuthor"
                placeholder="@username"
                value={targetAuthor}
                onChange={(e) => setTargetAuthor(e.target.value)}
              />
            </div>
          </>
        )}

        {postType === "original" && (
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="What should the post be about?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="context">Additional Context (optional)</Label>
          <Textarea
            id="context"
            placeholder="Any additional instructions or context..."
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={2}
          />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!isValid || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate 3 Options"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
