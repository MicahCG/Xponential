import { NextResponse } from "next/server";
import { evolveProfiles } from "@/lib/learning/profile-evolver";
import { analyzeGates } from "@/lib/learning/gate-analyzer";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [profileResult, gateResult] = await Promise.all([
      evolveProfiles("x"),
      analyzeGates("x"),
    ]);
    console.log("Profile evolution complete:", profileResult);
    console.log("Gate analysis complete:", gateResult);
    return NextResponse.json({ profile: profileResult, gate: gateResult });
  } catch (error) {
    console.error("Evolve/analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evolution failed" },
      { status: 500 }
    );
  }
}
