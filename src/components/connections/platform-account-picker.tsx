"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerAccount {
  id: string;
  accountHandle: string | null;
  status: string;
  hasAccessToken: boolean;
}

interface Props {
  platform: "x" | "pinterest" | "tiktok";
  accounts: PickerAccount[];
  currentId: string | null;
  /** Path to the "connect another" page for this platform. */
  connectHref: string;
  /** Short label like "TikTok account" for the dropdown header. */
  label: string;
}

export function PlatformAccountPicker({
  platform,
  accounts,
  currentId,
  connectHref,
  label,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const current = accounts.find((a) => a.id === currentId) ?? accounts[0];

  async function select(id: string) {
    if (id === current?.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/connections/${platform}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      if (res.ok) router.refresh();
      setOpen(false);
    });
  }

  // No accounts at all — render a Connect button instead
  if (accounts.length === 0) {
    return (
      <a
        href={connectHref}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      >
        <Plus className="h-4 w-4" />
        Connect {label}
      </a>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
            "hover:bg-accent"
          )}
        >
          <span className="text-muted-foreground">Account:</span>
          <span className="font-medium">
            {current?.accountHandle ? `@${current.accountHandle}` : "—"}
          </span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {label}s
        </DropdownMenuLabel>
        {accounts.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onClick={() => select(a.id)}
            className="gap-2"
          >
            <span className="flex-1 truncate">
              {a.accountHandle ? `@${a.accountHandle}` : "(no handle)"}
              {a.status !== "active" && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({a.status})
                </span>
              )}
              {!a.hasAccessToken && (
                <span className="ml-2 text-xs text-amber-600">
                  needs reconnect
                </span>
              )}
            </span>
            {a.id === current?.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={connectHref} className="gap-2">
            <Plus className="h-4 w-4" />
            Connect another {label}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
