import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { SkillMeta } from "../lib/types.js";

export interface LoadedSkills {
  systemPrompt: string;
  detectedSources: string[];
  selectedPlatform: string;
}

function readMd(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function readDir(dir: string): string {
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => readMd(join(dir, f)))
    .join("\n\n---\n\n");
}

export interface ReadSkillsOptions {
  skillsPath: string;
  platformId: string;
  sourceHint?: string; // optional — UI selection or prior detection
}

export async function readSkills(opts: ReadSkillsOptions): Promise<LoadedSkills> {
  const { skillsPath, platformId, sourceHint } = opts;
  const parts: string[] = [];

  // 1. _core — always loaded
  const core = readDir(join(skillsPath, "_core"));
  if (core) parts.push(`# CORE KNOWLEDGE\n\n${core}`);

  // 2. _shared — output format, validation rules, repo standard
  const shared = readDir(join(skillsPath, "_shared"));
  if (shared) parts.push(`# SHARED STANDARDS\n\n${shared}`);

  // 3. Source skills
  const sourcesDir = join(skillsPath, "sources");
  let detectedSources: string[] = [];

  if (sourceHint && existsSync(join(sourcesDir, `${sourceHint}.md`))) {
    const content = readMd(join(sourcesDir, `${sourceHint}.md`));
    parts.push(`# SOURCE KNOWLEDGE (${sourceHint})\n\n${content}`);
    detectedSources = [sourceHint];
  } else {
    // Load all sources — Claude detects which applies
    if (existsSync(sourcesDir)) {
      const files = readdirSync(sourcesDir).filter((f) => f.endsWith(".md"));
      detectedSources = files.map((f) => f.replace(".md", ""));
      const allSources = files.map((f) => readMd(join(sourcesDir, f))).join("\n\n---\n\n");
      parts.push(`# SOURCE KNOWLEDGE (all — detect which applies)\n\n${allSources}`);
    }
  }

  // 4. Platform
  const platformContent = readMd(join(skillsPath, "platforms", `${platformId}.md`));
  if (platformContent) {
    parts.push(`# OUTPUT PLATFORM: ${platformId}\n\n${platformContent}`);
  } else {
    parts.push(`# OUTPUT PLATFORM: ${platformId}\n\nNo dedicated skill. Use CI/CD primitives to generate appropriate syntax. Flag as assumption.`);
  }

  return {
    systemPrompt: parts.join("\n\n===\n\n"),
    detectedSources,
    selectedPlatform: platformId,
  };
}

export async function listSkills(skillsPath: string): Promise<SkillMeta[]> {
  const sourcesDir = join(skillsPath, "sources");
  if (!existsSync(sourcesDir)) return [];
  return readdirSync(sourcesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = readMd(join(sourcesDir, f));
      return {
        id: f.replace(".md", ""),
        name: content.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? f,
        description: content.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "",
        detectHints: content.match(/^detect_hints:\s*(.+)$/m)?.[1]?.trim() ?? "",
      };
    });
}
