import { readFileSync } from "fs";
import { join } from "path";

// Auto-load .env — tsx does not load .env automatically
try {
  const lines = readFileSync(join(process.cwd(), ".env"), "utf-8").split("\n");
  for (const line of lines) {
    const [k, ...v] = line.split("=");
    if (k?.trim() && !k.startsWith("#") && v.length) {
      process.env[k.trim()] ??= v.join("=").trim();
    }
  }
} catch {}

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface CallOptions {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

// Non-streaming — returns parsed JSON
export async function claudeJSON<T>(opts: CallOptions): Promise<T> {
  const msg = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const raw = msg.content.find((b) => b.type === "text")?.text ?? "";
  const clean = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(clean) as T;
}

// Streaming — calls onToken for each text delta
export async function claudeStream(
  opts: CallOptions & { onToken: (token: string) => void }
): Promise<void> {
  const stream = await client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      opts.onToken(event.delta.text);
    }
  }
}
