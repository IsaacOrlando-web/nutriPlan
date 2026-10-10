// Probes every configured provider with a tiny request so a dead key or retired model id is caught
// before a demo, not during it. Owner: Lead. Usage: node --env-file=.env.local scripts/check-models.mjs
const checks = [
  {
    provider: "anthropic",
    key: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-5-5", "claude-haiku-5-5"],
    call: (model, key) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
      }),
  },
  {
    provider: "google",
    key: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: ["gemini-3.5-flash"],
    call: (model, key) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
      }),
  },
  {
    provider: "openai",
    key: "OPENAI_API_KEY",
    models: ["gpt-4.1-mini"],
    call: (model, key) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
      }),
  },
];

let failures = 0;
for (const c of checks) {
  const key = process.env[c.key];
  if (!key) {
    console.log(`${c.provider.padEnd(10)} skipped (no ${c.key})`);
    continue;
  }
  for (const model of c.models) {
    const t0 = Date.now();
    try {
      const res = await c.call(model, key);
      const body = await res.json();
      const err = body.error?.message ?? (res.ok ? null : `HTTP ${res.status}`);
      const ms = `${Date.now() - t0} ms`.padStart(8);
      if (err) {
        failures++;
        console.log(`${c.provider.padEnd(10)} ${model.padEnd(20)} FAIL ${ms}  ${String(err).slice(0, 90)}`);
      } else {
        console.log(`${c.provider.padEnd(10)} ${model.padEnd(20)} ok   ${ms}`);
      }
    } catch (e) {
      failures++;
      console.log(`${c.provider.padEnd(10)} ${model.padEnd(20)} FAIL  ${e.message}`);
    }
  }
}
console.log(
  failures
    ? `\n${failures} failing. Agents fall back automatically, but fix these before the demo.`
    : "\nAll providers healthy.",
);
process.exit(failures ? 1 : 0);
