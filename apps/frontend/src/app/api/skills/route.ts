import { NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

export async function GET() {
  const res = await fetch(`${AGENT}/skills`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
