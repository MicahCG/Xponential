import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/setup-check";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    const setupDone = await isSetupComplete(session.user.id);
    redirect(setupDone ? "/dashboard" : "/setup");
  }

  redirect("/login");
}
