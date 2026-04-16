import { NextResponse } from "next/server";

// ⛔ Popcorn API integrations are halted — this route rejects all requests.
export async function GET() {
  return NextResponse.json(
    { error: "Video status checks are currently disabled. Popcorn API integrations are halted." },
    { status: 503 }
  );
}
