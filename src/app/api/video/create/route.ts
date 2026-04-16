import { NextResponse } from "next/server";

// ⛔ Popcorn API integrations are halted — this route rejects all requests.
export async function POST() {
  return NextResponse.json(
    { error: "Video creation is currently disabled. Popcorn API integrations are halted." },
    { status: 503 }
  );
}
