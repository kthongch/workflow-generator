import { NextRequest } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const upstream = await fetch(`${AGENT}/jobs/${params.id}/stream`, {
      headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(
        `data: ${JSON.stringify({ type: "job:failed", error: { message: "Agent stream unavailable" } })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return new Response(
      `data: ${JSON.stringify({ type: "job:failed", error: { message: String(err) } })}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
