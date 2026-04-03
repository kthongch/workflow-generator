// apps/frontend/src/app/api/jobs/[id]/approve/route.ts
// POST /api/jobs/:id/approve → proxy to agent

import { NextRequest, NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const res = await fetch(`${AGENT}/jobs/${params.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
