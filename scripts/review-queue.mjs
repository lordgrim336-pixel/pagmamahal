// Counts the "Pin in the wrong place?" reports waiting for the weekly Claude
// review, so the review can stop right away (and cheaply) when there are none.
// Needs nothing installed: Node's built-ins only.
//
//   node scripts/review-queue.mjs   ->  "app: 1, github: 0, total: 1"
//
// GitHub issues are counted through the public API (the repository is public).
// If GitHub can't be reached, they're counted as unknown and the review goes ahead.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "lordgrim336-pixel/pagmamahal";

const reports = JSON.parse(await readFile(join(ROOT, "data", "pin-reports.json"), "utf8"));
const app = reports.filter((r) => r.source === "app" && r.status === "pending").length;

let github = "unknown";
try {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&labels=wrong-pin,needs-review&per_page=100`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "pagmamahal-review-queue" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) {
    const issues = await res.json();
    github = issues.filter((i) => !i.pull_request && !i.labels.some((l) => l.name.startsWith("claude-"))).length;
  }
} catch {
  // leave as unknown
}

const total = github === "unknown" ? `${app}+` : app + github;
console.log(`app: ${app}, github: ${github}, total: ${total}`);
