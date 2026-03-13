import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzePersonality } from "@/lib/personality/analyzer";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["text/plain", "application/pdf", "text/markdown"];
const ALLOWED_EXTS = [".txt", ".pdf", ".md"];

async function extractText(file: File): Promise<string> {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

  if (ext === ".pdf" || file.type === "application/pdf") {
    // Dynamically import to avoid build issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    return data.text;
  }

  // Plain text / markdown
  return await file.text();
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a .txt, .pdf, or .md file." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB." },
      { status: 400 }
    );
  }

  let text: string;
  try {
    text = await extractText(file);
  } catch {
    return NextResponse.json(
      { error: "Failed to extract text from file. Make sure it is not password-protected." },
      { status: 400 }
    );
  }

  const trimmed = text.trim();
  if (trimmed.length < 100) {
    return NextResponse.json(
      { error: "File content is too short. Please upload a document with more content." },
      { status: 400 }
    );
  }

  // Truncate to ~12k chars to stay within model context
  const description = trimmed.slice(0, 12000);

  try {
    const profile = await analyzePersonality({
      method: "freetext",
      description: `The following is a document uploaded by the user to define their personality and communication style:\n\n${description}`,
    });

    await prisma.personalityProfile.updateMany({
      where: { userId: session.user.id, isActive: true },
      data: { isActive: false },
    });

    const saved = await prisma.personalityProfile.create({
      data: {
        userId: session.user.id,
        method: "freetext",
        rawInput: { fileName: file.name, charCount: trimmed.length },
        profileData: JSON.parse(JSON.stringify(profile)),
      },
    });

    return NextResponse.json({ id: saved.id, profile });
  } catch (error) {
    console.error("Upload personality error:", error);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
}
