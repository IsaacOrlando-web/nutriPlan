// PostToolUse hook: formats the file Claude just wrote or edited with Prettier.
// Cross platform (Windows, Mac, Linux): reads the hook JSON from stdin with Node instead of jq.
// Never fails the tool call: any problem is printed and the exit code stays 0.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|mdx|yml|yaml)$/i;
const SKIP = [
  /(^|[\\/])\.env/i,
  /(^|[\\/])node_modules[\\/]/,
  /(^|[\\/])\.next[\\/]/,
  /(^|[\\/])mocks[\\/]/,
  /(^|[\\/])agents[\\/]fallbacks[\\/]/,
  /package-lock\.json$/,
];

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let filePath;
  try {
    const payload = JSON.parse(raw || "{}");
    filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path;
  } catch {
    process.exit(0);
  }
  if (!filePath || !FORMATTABLE.test(filePath) || SKIP.some((re) => re.test(filePath))) process.exit(0);
  const abs = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), filePath);
  if (!existsSync(abs)) process.exit(0);

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["prettier", "--write", "--log-level", "warn", abs], {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  });
  if (result.error) console.error(`[format hook] prettier could not run: ${result.error.message}`);
  process.exit(0);
});
