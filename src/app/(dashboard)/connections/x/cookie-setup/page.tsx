import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TwitterCookieForm } from "@/components/settings/twitter-cookie-form";
import { Check } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Cookie Setup - Xponential",
};

export default async function CookieSetupPage() {
  const session = await requireAuth();

  const userId = session.user!.id as string;

  // Verify the user actually has an X connection
  const connection = await prisma.platformConnection.findUnique({
    where: {
      userId_platform: {
        userId,
        platform: "x",
      },
    },
    select: { accountHandle: true },
  });

  if (!connection) {
    redirect("/connections");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
            <Check className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            Account linked
          </span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            2
          </div>
          <span className="text-sm font-medium">Cookie setup</span>
        </div>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Almost done! Set up your Twitter cookie
        </h1>
        <p className="text-muted-foreground">
          Your X account <span className="font-medium text-foreground">@{connection.accountHandle}</span> is
          connected. One more step: paste your Twitter cookie so we can post
          tweets on your behalf.
        </p>
      </div>

      {/* Cookie form — redirects to /connections after save */}
      <TwitterCookieForm onSaveRedirect="/connections?connected=x" />

      {/* Skip link */}
      <div className="text-center">
        <Link
          href="/connections?connected=x"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Skip for now (you can add this later in Settings)
        </Link>
      </div>
    </div>
  );
}
