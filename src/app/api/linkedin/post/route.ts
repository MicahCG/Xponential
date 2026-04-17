import { NextResponse } from "next/server";

// LinkedIn integration has been removed.
export async function POST() {
  return NextResponse.json({ error: "LinkedIn integration removed" }, { status: 410 });
}
