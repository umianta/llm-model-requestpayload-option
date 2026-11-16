// Sends every request in the Postman collection to an OpenAI-compatible server (vLLM) and records what happened.
//
//   bun scripts/run-collection.ts <server-url> [folder-prefixes] [label]
//   bun scripts/run-collection.ts http://localhost:8000                       # everything
//   API_KEY=sk-... API_BASE=https://api.openai.com/v1 MODEL=<id> \
//     bun scripts/run-collection.ts https://api.openai.com "13." openai       # a hosted API
//
// Env vars: API_KEY (sent as "Authorization: Bearer ..."), API_BASE (default <server>/v1), MODEL (default from
// the collection).
//   bun scripts/run-collection.ts http://localhost:8000 "2.,4.,12." mine      # only these folders
//
// For each request:
//   1. TTFT probe: the same request with stream=true and max_tokens=1, under a unique cache_salt so it never
//      reuses (or seeds) the prefix cache. Time until the first token arrives = TTFT.
//   2. The real request, exactly as in the collection. Its full response is saved.
//
// Output:
//   results/<label>.md               one table row per request (status, TTFT, total time, tokens, output)
//   results/<label>.json             the same rows as JSON
//   results/payloads/<label>/*.json  full request + response payload per request
// A filtered run merges into existing results with the same label.

const [target, only = "", label = "run"] = process.argv.slice(2);
if (!target) throw new Error("usage: bun scripts/run-collection.ts <server-url> [folder-prefixes] [label]");

const root = new URL("..", import.meta.url).pathname;
const col = await Bun.file(`${root}postman/llm-model-requestpayload-options.postman_collection.json`).json();
const vars: Record<string, string> = Object.fromEntries(col.variable.map((v: any) => [v.key, v.value]));
vars.server = target;
vars.api_base = process.env.API_BASE ?? `${target}/v1`;
if (process.env.MODEL) vars.model = process.env.MODEL;
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.API_KEY) headers.Authorization = `Bearer ${process.env.API_KEY}`;
const sub = (s: string): string => {
  let prev = "";
  while (prev !== s) { prev = s; s = s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`); }
  return s;
};

type Row = { folder: string; name: string; file: string; status: number; ttft_ms: number | null; total_ms: number; prompt_tokens: number | null; completion_tokens: number | null; finish: string; text: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
// Keep saved payloads readable: replace base64 media with a short placeholder.
const shrink = (v: any): any => JSON.parse(JSON.stringify(v, (_k, x) =>
  typeof x === "string" && /^data:[a-z]+\/[a-z0-9.+-]+;base64,/.test(x) && x.length > 200 ? `${x.slice(0, x.indexOf(",") + 1)}<${Math.round(x.length / 1024)} KB base64 omitted>` : x));

async function ttftProbe(url: string, body: any): Promise<number | null> {
  if (body.use_beam_search || body.prompt_logprobs != null || body.n > 1) return null;
  const probe = { ...body, stream: true, max_tokens: 1, max_completion_tokens: undefined, min_tokens: 0, cache_salt: `ttft-${crypto.randomUUID()}` };
  delete probe.stream_options;
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(probe), signal: AbortSignal.timeout(300_000) });
    if (!res.ok || !res.body) return null;
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body as any) {
      buf += dec.decode(chunk, { stream: true });
      for (const line of buf.split("\n")) {
        if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
        try {
          const j = JSON.parse(line.slice(5));
          if (j.error) return null;
          const d = j.choices?.[0]?.delta ?? {};
          if (d.content || d.reasoning_content || d.tool_calls || j.choices?.[0]?.text) return Math.round(performance.now() - t0);
        } catch {}
      }
    }
  } catch {}
  return null;
}

const outJson = `${root}results/${label}.json`;
const previous: Row[] = only && (await Bun.file(outJson).exists()) ? await Bun.file(outJson).json() : [];
const rows: Row[] = [];

for (const f of col.item) {
  if (only && !only.split(",").some((p) => f.name.startsWith(p))) continue;
  const fnum = f.name.split(".")[0].padStart(2, "0");
  for (const it of f.item) {
    const r = it.request;
    const url = sub(r.url.raw);
    const body = r.body ? JSON.parse(sub(r.body.raw)) : undefined;
    const file = `${fnum}-${slug(it.name)}.json`;
    const isGen = r.method === "POST" && /\/v1\/(chat\/)?completions$/.test(url);

    const ttft = isGen && !body.stream ? await ttftProbe(url, body) : null;
    const t0 = performance.now();
    let status = 0, raw = "", parsed: any = null;
    try {
      const res = await fetch(url, { method: r.method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(600_000) });
      status = res.status;
      raw = await res.text();
      try { parsed = JSON.parse(raw); } catch {}
    } catch (e: any) { raw = `ERR ${e.message}`; }
    const total = Math.round(performance.now() - t0);

    // Streaming responses: keep the raw server-sent events (first and last few) and rebuild the text.
    let text = "", finish = "", pt: number | null = null, ct: number | null = null, streamTtft: number | null = null;
    let savedResponse: any = parsed ?? raw;
    if (body?.stream && !parsed) {
      const events = raw.split("\n").filter((l) => l.startsWith("data:"));
      for (const e of events) {
        if (e.includes("[DONE]")) continue;
        try {
          const j = JSON.parse(e.slice(5));
          if (j.error) { text = j.error.message; status = j.error.code ?? 400; }
          const c = j.choices?.[0];
          text += c?.delta?.content ?? "";
          if (c?.finish_reason) finish = c.finish_reason;
          if (j.usage) { pt = j.usage.prompt_tokens; ct = j.usage.completion_tokens; }
        } catch {}
      }
      savedResponse = events.length > 8 ? [...events.slice(0, 4), `... ${events.length - 7} more events ...`, ...events.slice(-3)] : events;
    } else if (parsed) {
      const c = parsed.choices?.[0];
      if (c) {
        text = c.message?.content ?? (c.message?.tool_calls ? JSON.stringify(c.message.tool_calls) : null) ?? c.text ?? "";
        finish = c.finish_reason ?? "";
      } else {
        text = parsed.error?.message ?? parsed.message ?? JSON.stringify(parsed);
      }
      pt = parsed.usage?.prompt_tokens ?? null; ct = parsed.usage?.completion_tokens ?? null;
    } else {
      text = raw;
    }
    if (url.endsWith("/metrics")) savedResponse = raw.split("\n").filter((l) => /^vllm:(num_requests|prompt_tokens_total|generation_tokens_total|prefix_cache)/.test(l)).slice(0, 12);

    await Bun.write(`${root}results/payloads/${label}/${file}`, JSON.stringify({
      request: { method: r.method, url: url.replace(vars.api_base, "{{api_base}}").replace(target, "{{server}}"), body: body ? shrink(body) : undefined },
      response: { status, time_ms: total, ttft_ms: ttft ?? streamTtft, body: shrink(savedResponse) },
    }, null, 2) + "\n");

    const row: Row = { folder: f.name, name: it.name, file, status, ttft_ms: ttft, total_ms: total, prompt_tokens: pt, completion_tokens: ct, finish, text: String(text) };
    rows.push(row);
    const tok = pt != null ? `${pt}/${ct}` : "";
    console.log(`${status} ttft ${String(ttft ?? "-").padStart(6)} total ${String(total).padStart(6)}ms ${tok.padEnd(10)} ${f.name.split(" ")[0]} ${it.name} :: ${finish ? `[${finish}] ` : ""}${String(text).replace(/\s+/g, " ").slice(0, 140)}`);
  }
}

if (previous.length) {
  const fresh = new Map(rows.map((r) => [r.folder + "|" + r.name, r]));
  const merged = previous.map((r) => fresh.get(r.folder + "|" + r.name) ?? r);
  for (const r of rows) if (!previous.some((p) => p.folder === r.folder && p.name === r.name)) merged.push(r);
  rows.splice(0, rows.length, ...merged);
}
const esc = (s: string) => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 200);
const md = [
  `# Run: ${label}`,
  "",
  `Target server: \`${target}\`, run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
  "TTFT = time to first token, measured cold (no prefix-cache reuse). Total = the real request, start to last byte.",
  `Full request/response payloads: [payloads/${label}/](payloads/${label}/).`,
  "",
  "| folder | request | status | TTFT ms | total ms | tokens in / out | finish | output (truncated) |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.folder.split(" ")[0]} | [${r.name}](payloads/${label}/${r.file}) | ${r.status} | ${r.ttft_ms ?? ""} | ${r.total_ms} | ${r.prompt_tokens != null ? `${r.prompt_tokens} / ${r.completion_tokens}` : ""} | ${r.finish} | ${esc(r.text)} |`),
  "",
].join("\n");
await Bun.write(outJson, JSON.stringify(rows, null, 2) + "\n");
await Bun.write(`${root}results/${label}.md`, md);
console.log(`\nwrote results/${label}.md, results/${label}.json, results/payloads/${label}/`);
