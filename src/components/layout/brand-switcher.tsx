"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  isDefault: boolean;
};

interface BrandSwitcherProps {
  currentBrand: { id: string; name: string; slug: string };
  brands: BrandSummary[];
  collapsed?: boolean;
}

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function BrandSwitcher({ currentBrand, brands, collapsed }: BrandSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectBrand(brandId: string) {
    if (brandId === currentBrand.id) return;
    startTransition(async () => {
      const res = await fetch("/api/brands/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) router.refresh();
    });
  }

  async function createBrand() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ? "Couldn't create brand." : "Couldn't create brand.");
        return;
      }
      const { brand } = await res.json();
      // Auto-switch to the new brand
      await fetch("/api/brands/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      setCreateOpen(false);
      setNewName("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  const currentSummary = brands.find((b) => b.id === currentBrand.id);
  const avatar = currentSummary?.avatarUrl ?? null;

  const triggerInner = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-semibold uppercase",
          avatar && "overflow-hidden"
        )}
      >
        {avatar ? (
          <Image src={avatar} alt={currentBrand.name} width={28} height={28} />
        ) : (
          initialsFor(currentBrand.name)
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left text-sm font-medium">
            {currentBrand.name}
          </span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sidebar-foreground/50" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          )}
        </>
      )}
    </>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title={collapsed ? currentBrand.name : undefined}
            className={cn(
              "flex w-full items-center rounded-md transition-colors",
              collapsed ? "justify-center p-1" : "gap-2 px-2 py-1.5",
              "hover:bg-sidebar-accent/50"
            )}
          >
            {triggerInner}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          sideOffset={6}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Brands
          </DropdownMenuLabel>
          {brands.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => selectBrand(b.id)}
              className="gap-2"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase">
                {b.avatarUrl ? (
                  <Image src={b.avatarUrl} alt={b.name} width={24} height={24} className="rounded" />
                ) : (
                  initialsFor(b.name)
                )}
              </span>
              <span className="flex-1 truncate">{b.name}</span>
              {b.id === currentBrand.id && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setNewName("");
              setError(null);
              setCreateOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New brand
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new brand</DialogTitle>
            <DialogDescription>
              Each brand is its own world — connections, personality, queue, and posts stay scoped to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="brand-name">Brand name</Label>
            <Input
              id="brand-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. EcoShopGuide"
              maxLength={50}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={createBrand}
              disabled={creating || newName.trim().length === 0}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
