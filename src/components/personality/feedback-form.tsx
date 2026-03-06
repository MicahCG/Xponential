"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  X,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Save,
} from "lucide-react";

interface FeedbackExample {
  type: "do" | "dont";
  text: string;
  note?: string;
}

interface FeedbackFormProps {
  initialInstructions: string | null;
  initialExamples: FeedbackExample[] | null;
}

export function FeedbackForm({
  initialInstructions,
  initialExamples,
}: FeedbackFormProps) {
  const [instructions, setInstructions] = useState(
    initialInstructions ?? ""
  );
  const [examples, setExamples] = useState<FeedbackExample[]>(
    initialExamples ?? []
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New example form state
  const [newDoText, setNewDoText] = useState("");
  const [newDoNote, setNewDoNote] = useState("");
  const [newDontText, setNewDontText] = useState("");
  const [newDontNote, setNewDontNote] = useState("");

  const addExample = (type: "do" | "dont") => {
    const text = type === "do" ? newDoText : newDontText;
    const note = type === "do" ? newDoNote : newDontNote;

    if (!text.trim()) return;

    setExamples((prev) => [
      ...prev,
      { type, text: text.trim(), note: note.trim() || undefined },
    ]);

    if (type === "do") {
      setNewDoText("");
      setNewDoNote("");
    } else {
      setNewDontText("");
      setNewDontNote("");
    }
    setSuccess(null);
  };

  const removeExample = (index: number) => {
    setExamples((prev) => prev.filter((_, i) => i !== index));
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/personality/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyInstructions: instructions.trim() || null,
          feedbackExamples: examples.length > 0 ? examples : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to save feedback");
        return;
      }

      setSuccess("Feedback saved! It will shape all future content generation.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const doExamples = examples.filter((e) => e.type === "do");
  const dontExamples = examples.filter((e) => e.type === "dont");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Feedback & Fine-Tuning
        </CardTitle>
        <CardDescription>
          Shape how your AI agent writes by providing instructions and examples.
          These override your personality profile where they conflict.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Custom Instructions */}
        <div className="space-y-2">
          <Label htmlFor="instructions" className="text-sm font-medium">
            Custom Instructions
          </Label>
          <p className="text-xs text-muted-foreground">
            Tell the AI how you want your content to sound. Be specific.
          </p>
          <Textarea
            id="instructions"
            placeholder="e.g. Be more sarcastic and edgy. Never use hashtags. Keep replies short and punchy. Don't start tweets with 'I'. Reference crypto and tech more often."
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              setSuccess(null);
            }}
            rows={4}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground text-right">
            {instructions.length}/2000
          </p>
        </div>

        <Separator />

        {/* Do Examples */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-green-600" />
            <Label className="text-sm font-medium">
              Good Examples — Do this
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste replies or posts you like. The AI will match this style.
          </p>

          {/* Existing do examples */}
          {doExamples.length > 0 && (
            <div className="space-y-2">
              {doExamples.map((ex, i) => {
                const globalIndex = examples.findIndex(
                  (e) => e === ex
                );
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-green-500/5 border border-green-500/20 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">&ldquo;{ex.text}&rdquo;</p>
                      {ex.note && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {ex.note}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeExample(globalIndex)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add do example form */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Input
              placeholder="Paste a tweet or reply you like..."
              value={newDoText}
              onChange={(e) => setNewDoText(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Why is this good? (optional)"
                value={newDoNote}
                onChange={(e) => setNewDoNote(e.target.value)}
                className="text-sm flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addExample("do")}
                disabled={!newDoText.trim()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Don't Examples */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ThumbsDown className="h-4 w-4 text-red-600" />
            <Label className="text-sm font-medium">
              Bad Examples — Don&apos;t do this
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste replies or posts you dislike. The AI will avoid this style.
          </p>

          {/* Existing don't examples */}
          {dontExamples.length > 0 && (
            <div className="space-y-2">
              {dontExamples.map((ex, i) => {
                const globalIndex = examples.findIndex(
                  (e) => e === ex
                );
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-red-500/5 border border-red-500/20 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">&ldquo;{ex.text}&rdquo;</p>
                      {ex.note && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {ex.note}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeExample(globalIndex)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add don't example form */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Input
              placeholder="Paste a tweet or reply you dislike..."
              value={newDontText}
              onChange={(e) => setNewDontText(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Why is this bad? (optional)"
                value={newDontNote}
                onChange={(e) => setNewDontNote(e.target.value)}
                className="text-sm flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addExample("dont")}
                disabled={!newDontText.trim()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Status messages */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            {success}
          </div>
        )}

        {/* Summary + Save */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-xs text-muted-foreground">
            {doExamples.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {doExamples.length} good example{doExamples.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {dontExamples.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {dontExamples.length} bad example{dontExamples.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Feedback
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
