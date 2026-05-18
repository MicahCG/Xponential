"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Twitter } from "lucide-react";

const tabs = [
  { href: "/content", label: "Auto-Replies" },
  { href: "/personality", label: "Personality" },
];

export function XTabs() {
  const pathname = usePathname();
  const activeHref =
    tabs.find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
      ?.href ?? tabs[0].href;

  return (
    <div className="mb-6 flex items-center gap-2 border-b">
      <div className="mr-3 flex items-center gap-2 pb-3 text-sm font-semibold text-muted-foreground">
        <Twitter className="h-4 w-4" />
        X / Twitter
      </div>
      <nav className="flex gap-1">
        {tabs.map((t) => {
          const active = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "rounded-t-md border-b-2 px-3 pb-2 pt-1 text-sm transition-colors",
                active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
