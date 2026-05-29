// Shared CLI primitives: colors, subprocess runner, HTTP ping, interactive
// prompts, and small helpers used by both the command dispatcher (index.ts)
// and the guided setup flows (setup.ts).
import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { request as httpsRequest } from "node:https";

export const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  brand: "\x1b[38;2;225;225;225m",
  brandDim: "\x1b[38;2;150;150;150m",
  gray: "\x1b[38;2;120;120;120m",
  white: "\x1b[97m",
  green: "\x1b[92m",
  red: "\x1b[91m",
  yellow: "\x1b[93m",
  cyan: "\x1b[96m",
};
function wrap(code: string, s: string): string {
  return useColor ? `${code}${s}${ANSI.reset}` : s;
}
export const c = {
  brand: (s: string) => wrap(ANSI.brand, s),
  brandDim: (s: string) => wrap(ANSI.brandDim, s),
  gray: (s: string) => wrap(ANSI.gray, s),
  white: (s: string) => wrap(ANSI.white, s),
  green: (s: string) => wrap(ANSI.green, s),
  red: (s: string) => wrap(ANSI.red, s),
  yellow: (s: string) => wrap(ANSI.yellow, s),
  cyan: (s: string) => wrap(ANSI.cyan, s),
  bold: (s: string) => wrap(ANSI.bold, s),
  dim: (s: string) => wrap(ANSI.dim, s),
};

// Spawn a command, inheriting stdio. Resolves with the exit code.
export function run(cmd: string, args: string[], opts: SpawnOptions = {}): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(c.red(`\nKilled by signal ${signal}`));
        res(128);
        return;
      }
      res(code ?? 1);
    });
    child.on("error", (err) => {
      console.error(c.red("Failed to spawn:"), (err as Error).message);
      res(1);
    });
  });
}

// Run a command and capture stdout (for parsing CLI output like a deploy URL).
export function capture(cmd: string, args: string[], opts: SpawnOptions = {}): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Is a CLI tool on PATH?
export function commandExists(cmd: string): boolean {
  const r = spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [cmd] : ["-v", cmd], { encoding: "utf8", shell: process.platform !== "win32" });
  return (r.status ?? 1) === 0 && (r.stdout ?? "").trim().length > 0;
}

// 256-bit random hex token (for MCP_AUTH_TOKEN / signing secret).
export function genToken(): string {
  return randomBytes(32).toString("hex");
}

// GET a URL, resolve with {status, body}. Used for health + OAuth metadata checks.
export function httpGet(url: string, timeoutMs = 12_000): Promise<{ status: number; body: string }> {
  return new Promise((res) => {
    const u = new URL(url);
    const req = httpsRequest(
      { method: "GET", hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: { "user-agent": "whoop-mcp-setup" } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (ch: string) => (body += ch));
        response.on("end", () => res({ status: response.statusCode ?? 0, body }));
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); res({ status: 0, body: "" }); });
    req.on("error", () => res({ status: 0, body: "" }));
    req.end();
  });
}

export function ping(url: string, timeoutMs = 10_000): Promise<number> {
  return httpGet(url, timeoutMs).then((r) => {
    const ok = r.status >= 200 && r.status < 300;
    const label = ok ? c.green(`✓ ${r.status}`) : c.red(`✗ ${r.status || "timeout"}`);
    const preview = r.body.length > 100 ? r.body.slice(0, 97) + "..." : r.body;
    console.log(`${label}  ${url}  ${c.gray(preview.replace(/\s+/g, " ").trim())}`);
    return ok ? 0 : 1;
  });
}

// ── interactive prompts ─────────────────────────────────────────────────────
// A fresh readline per question. Long-lived readlines break when a subprocess
// in between (e.g. the build step) inherits stdin, so we open/close per ask.
// On EOF (piped input) the question resolves empty instead of throwing.
async function ask(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(query)).trim();
  } catch {
    return "";
  } finally {
    rl.close();
  }
}

// Kept for API compatibility; no-op now that prompts are per-call.
export function closePrompts(): void {}

export async function prompt(question: string, fallback = ""): Promise<string> {
  const suffix = fallback ? c.gray(` [${fallback}]`) : "";
  const answer = await ask(`${c.cyan("?")} ${question}${suffix}: `);
  return answer || fallback;
}

export async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await ask(`${c.cyan("?")} ${question} ${c.gray(`(${hint})`)}: `)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

// Numbered menu. Returns the 0-based index of the choice.
export async function promptChoice(question: string, choices: string[]): Promise<number> {
  console.log(`${c.cyan("?")} ${question}`);
  choices.forEach((ch, i) => console.log(`  ${c.bold(String(i + 1))}. ${ch}`));
  for (let attempts = 0; attempts < 100; attempts++) {
    const raw = await ask(`  ${c.gray("enter a number")}: `);
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
    if (raw === "") return 0; // EOF / piped input → first choice (safe default)
    console.log(c.red(`  Please enter 1-${choices.length}.`));
  }
  return 0;
}

// Section header for the guided flows.
export function step(n: number, total: number, title: string): void {
  console.log("");
  console.log(`${c.brand(`[${n}/${total}]`)} ${c.bold(title)}`);
}
