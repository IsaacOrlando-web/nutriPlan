#!/usr/bin/env node
// NutriPlan AI first time setup. Cross platform (Windows, Mac, Linux), no dependencies. Owner: Lead.
//   npm run setup                  check tools, create .env.local, install deps and the Playwright browser, typecheck
//   npm run setup -- --no-browsers skip the Playwright Chromium download
//   npm run doctor                 (= --check) report versions and env status only, install nothing
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const NO_BROWSERS = args.has("--no-browsers");
const IS_WIN = process.platform === "win32";
const MIN_NODE = 20;

const ok = (msg) => console.log(`  [ok]   ${msg}`);
const warn = (msg) => console.log(`  [warn] ${msg}`);
const fail = (msg) => console.log(`  [FAIL] ${msg}`);
const title = (msg) => console.log(`\n${msg}`);

let failures = 0;

function run(cmd, cmdArgs, opts = {}) {
  // shell: true so npm/npx resolve to their .cmd shims on Windows.
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: opts.quiet ? "pipe" : "inherit",
    shell: true,
    encoding: "utf8",
    ...opts,
  });
}

function version(cmd, cmdArgs = ["--version"]) {
  const r = run(cmd, cmdArgs, { quiet: true });
  if (r.status !== 0 || r.error) return null;
  return String(r.stdout || r.stderr)
    .trim()
    .split(/\r?\n/)[0];
}

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// ---------------------------------------------------------------------------
title(`NutriPlan AI ${CHECK_ONLY ? "doctor" : "setup"}  (${ROOT})`);

// 1. Node
title("Tools");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= MIN_NODE) ok(`Node ${process.versions.node}`);
else {
  fail(`Node ${process.versions.node} is too old; need ${MIN_NODE}+`);
  console.log(
    IS_WIN
      ? "         install: winget install OpenJS.NodeJS.LTS   (or nvm-windows: nvm install 20)"
      : "         install: brew install node   (or nvm install 20 && nvm use 20)",
  );
  failures++;
}
const npmV = version("npm");
if (npmV) ok(`npm ${npmV}`);
else {
  fail("npm not found on PATH");
  failures++;
}

// 2. git
const gitV = version("git");
if (gitV) ok(gitV);
else {
  fail("git not found");
  console.log(
    IS_WIN
      ? "         install: winget install Git.Git"
      : "         install: brew install git   (or xcode-select --install)",
  );
  failures++;
}

// 3. Docker (optional)
const dockerV = version("docker");
if (dockerV) {
  const info = run("docker", ["info"], { quiet: true });
  if (info.status === 0) ok(`${dockerV} (daemon running)`);
  else
    warn(`${dockerV} installed but Docker Desktop is not running. Only needed for the container image.`);
} else warn("Docker not found. Optional: only needed for the container image.");

if (nodeMajor < MIN_NODE || !npmV) {
  console.log("\nFix the failures above and run again.");
  process.exit(1);
}

// 4. .env.local
title("Environment");
// .env.example is the template; docs/env.example is its tracked twin (Claude Code is denied writing .env* files).
const envExample = [path.join(ROOT, ".env.example"), path.join(ROOT, "docs", "env.example")].find((f) =>
  fs.existsSync(f),
);
const envLocal = path.join(ROOT, ".env.local");
if (!fs.existsSync(envLocal)) {
  if (CHECK_ONLY)
    warn(
      ".env.local missing (npm run setup creates it from .env.example). Defaults still work: memory backend, local auth, scripted agents.",
    );
  else if (envExample) {
    fs.copyFileSync(envExample, envLocal);
    ok(`created .env.local from ${path.relative(ROOT, envExample)}`);
  } else warn(".env.example missing; skipping .env.local");
} else ok(".env.local present");

// Report env status without printing any secret values.
const env = { ...readEnvFile(envLocal), ...process.env };
const has = (k) => Boolean(env[k] && String(env[k]).trim());
const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"];
for (const k of keys) console.log(`  ${has(k) ? "[set]  " : "[blank]"} ${k}`);
const mocks = env.NEXT_PUBLIC_USE_MOCKS === "true";
const anyKey = keys.some(has);
const agentsMode =
  env.AGENTS_MODE === "scripted" || env.AGENTS_MODE === "live"
    ? env.AGENTS_MODE
    : anyKey
      ? "live (auto)"
      : "scripted (auto)";
console.log("");
console.log(`  frontend data : ${mocks ? "MOCKS (/mocks/*.json, no API calls)" : "real API routes"}`);
console.log(`  data backend  : local JSON (${env.MEMORY_STORE_FILE || ".data/store.json"})`);
console.log("  auth mode     : local cookie");
console.log(`  agents mode   : ${agentsMode}`);
console.log(
  `  event delay   : ${env.AGENT_EVENT_DELAY_MS || "900"} ms, fallback ${env.AGENTS_FALLBACK === "false" ? "off" : "on"}`,
);
if (env.AGENTS_MODE === "live" && !anyKey) {
  warn("AGENTS_MODE=live but no model key is set; the Agent Room will fail. Unset AGENTS_MODE or add a key.");
}

// 5. Dependencies
title("Dependencies");
const nodeModules = path.join(ROOT, "node_modules");
if (fs.existsSync(path.join(nodeModules, "next"))) ok("node_modules present");
else if (CHECK_ONLY) {
  warn("node_modules missing; run npm run setup (or npm install)");
} else {
  console.log("  installing with npm install ...");
  const r = run("npm", ["install"]);
  if (r.status === 0) ok("npm install done");
  else {
    fail("npm install failed");
    failures++;
  }
}

// 6. Playwright browser
const pwCache = IS_WIN
  ? path.join(process.env.LOCALAPPDATA || "", "ms-playwright")
  : process.platform === "darwin"
    ? path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright")
    : path.join(process.env.HOME || "", ".cache", "ms-playwright");
const hasChromium = fs.existsSync(pwCache) && fs.readdirSync(pwCache).some((d) => d.startsWith("chromium"));
if (hasChromium) ok("Playwright Chromium installed");
else if (CHECK_ONLY || NO_BROWSERS)
  warn(
    "Playwright Chromium not installed (npx playwright install chromium) - needed for npm run test:e2e and screenshots",
  );
else {
  console.log("  installing Playwright Chromium (one time, ~150 MB) ...");
  const r = run("npx", ["playwright", "install", "chromium"]);
  if (r.status === 0) ok("Playwright Chromium installed");
  else warn("Playwright install failed; run `npx playwright install chromium` later");
}

// 7. .data
const dataDir = path.join(ROOT, ".data");
if (fs.existsSync(dataDir)) ok(".data/ present (memory store)");
else if (CHECK_ONLY) warn(".data/ missing (created on first run)");
else {
  fs.mkdirSync(dataDir, { recursive: true });
  ok("created .data/");
}

// 8. Typecheck
if (!CHECK_ONLY) {
  title("Typecheck");
  const r = run("npm", ["run", "typecheck"]);
  if (r.status === 0) ok("typecheck clean");
  else {
    fail("typecheck has errors (see above). The app may still run; fix before opening a PR.");
    failures++;
  }
}

// 9. Next steps
title(failures ? `Done with ${failures} problem(s).` : "Ready.");
console.log(`
  Next steps:
    npm run dev                -> http://localhost:3000  then click "Try as Alex"
    npm run test:e2e           -> Playwright demo flow (laptop + phone)
    npm run doctor             -> this report again
  Add model keys to .env.local for live agents (optional). Read docs/<your-role>-brief.md and CLAUDE.md.
`);
process.exit(failures ? 1 : 0);
