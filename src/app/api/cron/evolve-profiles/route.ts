import { NextResponse } from "next/server";
import { evolveProfiles } from "@/lib/learning/profile-evolver";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await evolveProfiles("x");
    console.log("Profile evolution complete:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Profile evolution error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evolution failed" },
      { status: 500 }
    );
  }
}
