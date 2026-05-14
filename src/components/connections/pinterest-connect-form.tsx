"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, Cookie, Loader2, Trash2 } from "lucide-react";

interface Props {
  currentHandle: string | null;
  hasCookie: boolean;
  cookiePreview: string | null;
  brandName: string;
}

export function PinterestConnectForm({
  currentHandle,
  hasCookie,
  cookiePreview,
  brandName,
}: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState(currentHandle ?? "");
  const [cookie, setCookie] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (!handle.trim()) {
      setError("Pinterest handle is required.");
      return;
    }
    if (!cookie.trim() || cookie.trim().length < 20) {
      setError("Paste your Pinterest session cookie (header-string format).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/connections/pinterest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: handle.trim(),
          pinterestCookie: cookie.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body.error === "string" ? body.error : "Failed to save."
        );
        return;
      }
      setCookie("");
      setSuccess(`Pinterest connected for ${brandName}.`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/connections/pinterest", {
        method: "DELETE",
      });
      if (res.ok) {
        setHandle("");
        setSuccess("Pinterest disconnected.");
        router.refresh();
      } else {
        setError("Failed to disconnect.");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.02]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie className="h-5 w-5 text-amber-600" />
          Cookie Fallback —{" "}
          <span className="text-amber-700 dark:text-amber-500">
            Internal Testing Only
          </span>
        </CardTitle>
        <CardDescription>
          Not part of the production path. Use the Official Pinterest API above
          for publishing whenever it&apos;s connected. This cookie path exists
          only as an internal fallback before Standard Access is granted, and
          will not be used while the API path is connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCookie && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Cookie configured for{" "}
              <span className="font-medium">@{currentHandle}</span> ·{" "}
              <code className="text-xs">{cookiePreview}</code>
            </span>
          </div>
        )}

        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">
            How to get your Pinterest cookie:
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Install the{" "}
              <a
                href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Cookie-Editor
              </a>{" "}
              Chrome extension
            </li>
            <li>Log in to Pinterest in the same browser</li>
            <li>Click the Cookie-Editor icon on pinterest.com</li>
            <li>Click &quot;Export&quot; → &quot;Header String&quot;</li>
            <li>Paste the copied string below</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin-handle">Pinterest handle</Label>
          <Input
            id="pin-handle"
            placeholder="ecoshopguide"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            maxLength={50}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin-cookie">Cookie header string</Label>
          <Textarea
            id="pin-cookie"
            placeholder="Paste your Pinterest cookie here..."
            value={cookie}
            onChange={(e) => {
              setCookie(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            rows={4}
            className="font-mono text-xs"
          />
        </div>

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

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : hasCookie ? (
              "Update cookie"
            ) : (
              "Connect Pinterest"
            )}
          </Button>
          {hasCookie && (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={deleting}
              className="text-destructive"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
