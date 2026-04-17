import { NextResponse } from "next/server";

// LinkedIn integration has been removed.
export async function GET() {
  return NextResponse.json({ error: "LinkedIn integration removed" }, { status: 410 });
}
export async function POST() {
  return NextResponse.json({ error: "LinkedIn integration removed" }, { status: 410 });
}
