import { NextResponse } from "next/server";

// LinkedIn integration has been removed.
export async function GET() {
  return NextResponse.json({ success: true, message: "LinkedIn integration removed" });
}
