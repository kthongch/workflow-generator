import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

async function agentHeaders(): Promise<Record<string, string>> {
  const session = await getServerSession(authOptions);
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if ((session as any)?.accessToken) {
    h["Authorization"] = `Bearer ${(session as any).accessToken}`;
  }
  return h;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${AGENT}/jobs`, {
    method: "POST",
    headers: await agentHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
