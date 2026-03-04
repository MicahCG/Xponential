"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";

export async function register(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return { error: "This username is already taken" };
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { username, password: hashed, name: name || null },
  });

  return { success: true };
}

export async function login(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  try {
    await signIn("credentials", { username, password, redirectTo: "/dashboard" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "type" in error && (error as { type: string }).type === "CredentialsSignin") {
      return { error: "Invalid username or password" };
    }
    throw error;
  }
}
