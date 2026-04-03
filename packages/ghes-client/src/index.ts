import { Octokit } from "@octokit/rest";

export interface GHESConfig {
  baseUrl: string;   // https://code.ssnc.dev/api/v3
  token: string;     // bot PAT
}

export interface CreatePROptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;      // branch name
  base: string;      // target branch, usually 'main'
  files: { path: string; content: string }[];
}

export interface PRResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
}

export class GHESClient {
  private octokit: Octokit;

  constructor(config: GHESConfig) {
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl,
    });
  }

  // Create branch + commit files + open PR in one call
  async createPR(opts: CreatePROptions): Promise<PRResult> {
    const { owner, repo, title, body, head, base, files } = opts;

    // Get base branch SHA
    const { data: ref } = await this.octokit.git.getRef({
      owner, repo,
      ref: `heads/${base}`,
    });
    const baseSha = ref.object.sha;

    // Create branch
    await this.octokit.git.createRef({
      owner, repo,
      ref: `refs/heads/${head}`,
      sha: baseSha,
    });

    // Create/update each file
    for (const file of files) {
      const content = Buffer.from(file.content, "utf-8").toString("base64");

      // Check if file exists (for update)
      let existingSha: string | undefined;
      try {
        const { data: existing } = await this.octokit.repos.getContent({
          owner, repo, path: file.path, ref: head,
        });
        if (!Array.isArray(existing)) existingSha = existing.sha;
      } catch {
        // File doesn't exist — create
      }

      await this.octokit.repos.createOrUpdateFileContents({
        owner, repo,
        path: file.path,
        message: `chore: add ${file.path} via Workflow Generator`,
        content,
        branch: head,
        ...(existingSha ? { sha: existingSha } : {}),
      });
    }

    // Open PR
    const { data: pr } = await this.octokit.pulls.create({
      owner, repo, title, body,
      head, base,
    });

    return {
      prUrl: pr.html_url,
      prNumber: pr.number,
      branchName: head,
    };
  }

  // Read file contents from a repo (used to read skill files from GHES)
  async readFile(owner: string, repo: string, path: string, ref = "main"): Promise<string> {
    const { data } = await this.octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data)) throw new Error(`${path} is a directory`);
    if (data.type !== "file" || !("content" in data)) throw new Error(`${path} is not a file`);
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  // List files in a directory (used to discover skill files)
  async listDir(owner: string, repo: string, path: string, ref = "main"): Promise<string[]> {
    const { data } = await this.octokit.repos.getContent({ owner, repo, path, ref });
    if (!Array.isArray(data)) throw new Error(`${path} is not a directory`);
    return data.map((f) => f.path);
  }
}
