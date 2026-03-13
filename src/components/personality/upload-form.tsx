"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, FileText, X, CheckCircle } from "lucide-react";
import type { PersonalityProfile } from "@/lib/personality/types";

const ACCEPTED = ".txt,.pdf,.md";

const PROGRESS_MESSAGES = [
  "Reading your document...",
  "Analyzing your writing style...",
  "Identifying tone and voice patterns...",
  "Building your personality profile...",
  "Almost done...",
];

export function UploadForm({ onComplete }: { onComplete: (profile: PersonalityProfile) => void }) {
  const [file, setFile]           = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [progressIdx, setProgressIdx] = useState(0);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setProgressIdx(0);

    intervalRef.current = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 4000);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/personality/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        return;
      }

      onComplete(data.profile);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload a Document
        </CardTitle>
        <CardDescription>
          Upload any document that represents your writing style — a bio, writing samples, a personal essay, past posts, or a brand guide. We&apos;ll extract your voice from it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        {!loading && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-10 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {file ? (
              <>
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">Drop your file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .txt, .pdf, .md — max 5MB</p>
                </div>
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {/* Progress */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{PROGRESS_MESSAGES[progressIdx]}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {!loading && (
          <Button onClick={handleSubmit} disabled={!file || loading} className="w-full">
            Analyze Document
          </Button>
        )}

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">What works best:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Your own writing samples or past social media posts</li>
            <li>A personal bio or &quot;about me&quot; document</li>
            <li>A brand voice guide or style document</li>
            <li>A personal essay or blog posts</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
