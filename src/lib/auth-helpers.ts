import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

export async function getAuthUser() {
  const session = await auth();
  return session?.user ?? null;
}
