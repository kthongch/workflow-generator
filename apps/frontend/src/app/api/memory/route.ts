import { NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

export async function GET() {
  try {
    const res = await fetch(`${AGENT}/memory`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ sources: [] });
  }
}
