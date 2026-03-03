import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ProfileDisplay } from "@/components/personality/profile-display";
import type { PersonalityProfile } from "@/lib/personality/types";

export default async function PersonalityPage() {
  const session = await requireAuth();

  const profile = await prisma.personalityProfile.findFirst({
    where: { userId: session.user!.id, isActive: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Personality Profile
          </h1>
          <p className="text-muted-foreground">
            Configure your voice profile so generated content sounds like you
          </p>
        </div>
        <Link href="/personality/setup">
          <Button variant={profile ? "outline" : "default"}>
            {profile ? "Reconfigure" : "Set Up Profile"}
          </Button>
        </Link>
      </div>

      {profile ? (
        <ProfileDisplay
          profile={profile.profileData as unknown as PersonalityProfile}
          method={profile.method}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No personality profile configured yet.
          </p>
          <Link href="/personality/setup">
            <Button className="mt-4">Set Up Your Profile</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
