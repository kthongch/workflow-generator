import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const headers: Record<string, string> = {};

  // Forward access token to agent if available
  if ((session as any)?.accessToken) {
    headers["Authorization"] = `Bearer ${(session as any).accessToken}`;
  }

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "200";

  try {
    const res = await fetch(`${AGENT}/audit?limit=${limit}`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
