// Generates a Postman v2.1 collection demonstrating every vLLM chat-completions request option.
const out = process.argv[2];
if (!out) throw new Error("usage: bun gen-postman.ts <output.json>");

type Req = { name: string; desc: string; body?: Record<string, unknown>; path?: string; method?: string };

const chat = (extra: Record<string, unknown>, content = "{{prompt}}") => ({
  model: "{{model}}",
  messages: [{ role: "user", content }],
  max_tokens: 128,
  ...extra,
});

const COMPLAINT_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "complaint",
    strict: true,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        order_id: { type: "integer" },
        date: { type: "string" },
        problem: { type: "string" },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
      },
      required: ["name", "order_id", "date", "problem", "phone", "email"],
      additionalProperties: false,
    },
  },
};

const EMAIL =
  "Email: \"Hi, I am Priya Shah. My order #4471 arrived broken on 3 Nov 2026. The screen is cracked. Please call me at 555-0142.\"";

const groups: { name: string; desc: string; items: Req[] }[] = [
  {
    name: "0. Server info",
    desc: "Check the server is up and which model name to use.",
    items: [
      { name: "health", desc: "200 = ready.", method: "GET", path: "/health" },
      { name: "list models (GET /v1/models)", desc: "The `id` here is what goes in `model`.", method: "GET", path: "/v1/models" },
      { name: "version", desc: "vLLM version (fields differ between versions).", method: "GET", path: "/version" },
    ],
  },
  {
    name: "1. Content: model + messages",
    desc: "What the model reads. Roles: system (rules), user, assistant (earlier replies), tool (tool results).",
    items: [
      { name: "minimal request", desc: "Only the two required fields.", body: { model: "{{model}}", messages: [{ role: "user", content: "Say hello in 5 words." }] } },
      {
        name: "system + multi-turn",
        desc: "System sets the rules; earlier assistant turns give the model conversation memory.",
        body: {
          model: "{{model}}",
          max_tokens: 64,
          messages: [
            { role: "system", content: "You are a pirate. Answer in one sentence." },
            { role: "user", content: "What is 2+2?" },
            { role: "assistant", content: "Arr, that be 4, matey!" },
            { role: "user", content: "And times 3?" },
          ],
        },
      },
    ],
  },
  {
    name: "2. Randomness (sampling)",
    desc: "How the next token is picked from the model's scores. For extraction/JSON use temperature 0 and nothing else.",
    items: [
      { name: "temperature 0 (deterministic)", desc: "Always the top token. Run twice: identical text.", body: chat({ temperature: 0 }) },
      { name: "temperature 1.2 (creative)", desc: "Flatter distribution: more varied, sometimes odd. Run twice: different text.", body: chat({ temperature: 1.2 }) },
      { name: "top_p 0.9", desc: "Sample only from the smallest set of tokens covering 90% probability.", body: chat({ temperature: 0.8, top_p: 0.9 }) },
      { name: "top_k 40", desc: "Sample only from the 40 highest-scoring tokens.", body: chat({ temperature: 0.8, top_k: 40 }) },
      { name: "min_p 0.05", desc: "Drop tokens less than 5% as likely as the top one. (Rejected if the server uses speculative decoding.)", body: chat({ temperature: 0.8, min_p: 0.05 }) },
      { name: "seed 42 (repeatable random)", desc: "Same seed + same input = same sampled output, even at temperature 1.", body: chat({ temperature: 1.0, seed: 42 }) },
      { name: "n 3 (three answers)", desc: "Three independent answers in `choices[0..2]`.", body: chat({ temperature: 0.9, n: 3, max_tokens: 40 }, "Suggest a name for a coffee shop.") },
      { name: "beam search", desc: "Explores several candidates and keeps the best. Slow (~10x here) and rarely better for chat models; on Gemma-4 it leaked end-of-turn markers (<turn|>) into the text. length_penalty > 1 favours longer outputs.", body: chat({ use_beam_search: true, n: 2, length_penalty: 1.0, temperature: 0, max_tokens: 40 }, "Translate to French: The cat sleeps on the warm sofa.") },
    ],
  },
  {
    name: "3. Length and stopping",
    desc: "Check `choices[0].finish_reason`: stop = natural end or stop string, length = hit max_tokens.",
    items: [
      { name: "max_tokens 20 (cut off)", desc: "finish_reason becomes \"length\".", body: chat({ temperature: 0, max_tokens: 20 }) },
      { name: "max_completion_tokens", desc: "Newer OpenAI name for max_tokens.", body: { ...chat({ temperature: 0 }), max_tokens: undefined, max_completion_tokens: 30 } },
      { name: "min_tokens 100", desc: "Model may not end before 100 tokens. Watch what happens when the natural answer is short: it is forced past its end and produces junk (on Gemma-4: emoji repeated). Use only when the content really is long.", body: chat({ temperature: 0, min_tokens: 100, max_tokens: 150 }, "Say OK.") },
      { name: "stop strings", desc: "Stops at the first \"4.\"; the stop text is removed.", body: chat({ temperature: 0, stop: ["4.", "\n\n\n"] }, "List 10 fruits, numbered 1. to 10.") },
      { name: "include_stop_str_in_output", desc: "Same as above, but \"4.\" stays in the text.", body: chat({ temperature: 0, stop: ["4."], include_stop_str_in_output: true }, "List 10 fruits, numbered 1. to 10.") },
      { name: "stop_token_ids", desc: "Stop on exact token IDs. 107 = newline in Gemma-4 (from /tokenize), so this stops after the first line.", body: chat({ temperature: 0, stop_token_ids: [107] }, "Write three lines of a poem.") },
      { name: "ignore_eos (fixed length, benchmarks)", desc: "Ignores the end-of-turn token and always writes exactly max_tokens. Used for benchmarks; the text after the natural end is junk (\"hi! hi! hi!\").", body: chat({ temperature: 0, ignore_eos: true, max_tokens: 64 }, "Say hi.") },
    ],
  },
  {
    name: "4. Repetition and banned words",
    desc: "Steer which tokens are allowed or discouraged.",
    items: [
      { name: "frequency_penalty", desc: "Penalty grows each time a token repeats. Range -2..2.", body: chat({ temperature: 0.7, frequency_penalty: 1.0 }, "Write a paragraph about the sea.") },
      { name: "presence_penalty", desc: "Flat penalty once a token has appeared: pushes toward new topics.", body: chat({ temperature: 0.7, presence_penalty: 1.0 }, "Write a paragraph about the sea.") },
      { name: "repetition_penalty (vLLM)", desc: "Multiplier: 1.0 off, >1 less repetition.", body: chat({ temperature: 0.7, repetition_penalty: 1.15 }, "Write a paragraph about the sea.") },
      { name: "bad_words", desc: "These words are never generated.", body: chat({ temperature: 0, bad_words: ["blue", "Blue"] }, "What colour is the sky on a clear day? One word.") },
      { name: "logit_bias", desc: "Push a token ID up/down; -100 bans it. 9079 = \" Paris\" and 50429 = \"Paris\" in Gemma-4 (look IDs up with /tokenize). (Rejected if the server uses speculative decoding.)", body: chat({ temperature: 0, max_tokens: 20, logit_bias: { "9079": -100, "50429": -100 } }, "The capital of France is") },
      { name: "allowed_token_ids", desc: "Only these token IDs may be picked: 10784 = \"Yes\", 3771 = \"No\" in Gemma-4 (from /tokenize). With placeholder IDs the model is forced into nonsense.", body: chat({ temperature: 0, max_tokens: 1, allowed_token_ids: [10784, 3771] }, "Is water wet? Answer yes or no.") },
    ],
  },
  {
    name: "5. Output format (JSON, choice, regex, grammar)",
    desc: "Structured outputs: vLLM blocks every token that would break the format, so the shape is guaranteed (the facts are not).",
    items: [
      { name: "just ask (no enforcement)", desc: "Usually JSON; may add chatter or break. Compare with the next requests.", body: chat({ temperature: 0 }, `${EMAIL}\nReturn JSON with name, order_id, date, problem. JSON only.`) },
      { name: "response_format json_object", desc: "Guaranteed valid JSON, but any shape.", body: chat({ temperature: 0, response_format: { type: "json_object" } }, `${EMAIL}\nReturn JSON with name, order_id, date, problem.`) },
      {
        name: "json_schema, schema only (watch it fail)",
        desc: "Guaranteed valid JSON with exactly these fields and types, yet look at the result: order_id -4471 and endless whitespace until max_tokens. The model wanted to write \"#4471\" (\"#\" is not allowed in an integer, so it picked \"-\"), and wanted to close the JSON before \"email\" (required, but not in the text), so it stalls on whitespace. The schema constrains the shape; it does not tell the model what you want.",
        body: chat({ temperature: 0, max_tokens: 300, response_format: COMPLAINT_FORMAT }, `${EMAIL}\nExtract the fields.`),
      },
      {
        name: "json_schema + fields described in prompt (recommended)",
        desc: "Same schema, but the prompt names every field, says what goes in it, and says to use null when missing. Result: order_id 4471, email null, clean finish. Rule: describe the fields in the prompt AND enforce them with the schema.",
        body: chat({ temperature: 0, max_tokens: 300, response_format: COMPLAINT_FORMAT }, `${EMAIL}\nReturn JSON with exactly these fields: name, order_id (the number after #, as an integer), date, problem, phone, email. Use null for any field that is not in the text.`),
      },
      {
        name: "structured_outputs.json (vLLM native)",
        desc: "Same as json_schema, vLLM's own field. Array of objects example.",
        body: chat(
          {
            temperature: 0,
            max_tokens: 200,
            structured_outputs: {
              json: {
                type: "array",
                items: { type: "object", properties: { fruit: { type: "string" }, colour: { type: "string" } }, required: ["fruit", "colour"] },
                minItems: 3,
                maxItems: 3,
              },
            },
          },
          "Give me 3 fruits and their colours.",
        ),
      },
      { name: "structured_outputs.choice (classifier)", desc: "Answer is exactly one of the options.", body: chat({ temperature: 0, structured_outputs: { choice: ["positive", "negative", "neutral"] } }, "Review: 'Broke after 2 days.' Sentiment?") },
      { name: "structured_outputs.regex (phone number)", desc: "Answer must match the pattern.", body: chat({ temperature: 0, max_tokens: 20, structured_outputs: { regex: "\\d{3}-\\d{4}" } }, `${EMAIL}\nWhat is the phone number?`) },
      {
        name: "structured_outputs.grammar (SQL)",
        desc: "Answer must follow an EBNF/Lark grammar: here a tiny SELECT statement.",
        body: chat(
          {
            temperature: 0,
            max_tokens: 60,
            structured_outputs: {
              grammar:
                'root ::= "SELECT " cols " FROM " ident where? ";"\ncols ::= "*" | ident ("," " "? ident)*\nwhere ::= " WHERE " ident " " op " " value\nop ::= "=" | ">" | "<"\nvalue ::= [0-9]+ | "\'" [a-zA-Z ]+ "\'"\nident ::= [a-z_]+',
            },
          },
          "Table orders(id, customer, total). SQL for orders with total over 100.",
        ),
      },
      {
        name: "structured_outputs json_object + whitespace off",
        desc: "Compact JSON with no extra spaces/newlines (fewer tokens).",
        body: chat({ temperature: 0, structured_outputs: { json_object: true, disable_any_whitespace: true } }, `${EMAIL}\nReturn JSON with name and order_id.`),
      },
      {
        name: "continue_final_message (prefill the answer)",
        desc: "Model continues your half-written assistant message. Forces the reply to start with {\"name\": \".",
        body: {
          model: "{{model}}",
          temperature: 0,
          max_tokens: 80,
          add_generation_prompt: false,
          continue_final_message: true,
          messages: [
            { role: "user", content: `${EMAIL}\nReturn JSON with name and order_id.` },
            { role: "assistant", content: '{"name": "' },
          ],
        },
      },
    ],
  },
  {
    name: "6. Tools (function calling)",
    desc: "Needs server flags: --enable-auto-tool-choice --tool-call-parser <parser for the model>. The model asks for a call; your code runs it and replies with a tool message.",
    items: [
      {
        name: "tool_choice auto",
        desc: "Model decides whether to call get_weather. Look at choices[0].message.tool_calls. Server must run with --enable-auto-tool-choice --tool-call-parser <parser for the model>, else 400.",
        body: {
          model: "{{model}}",
          temperature: 0,
          messages: [{ role: "user", content: "What's the weather in Paris right now?" }],
          tools: [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Current weather for a city",
                parameters: { type: "object", properties: { city: { type: "string" }, unit: { type: "string", enum: ["celsius", "fahrenheit"] } }, required: ["city"] },
              },
            },
          ],
          tool_choice: "auto",
          parallel_tool_calls: true,
        },
      },
      {
        name: "tool_choice forced",
        desc: "Must call get_weather. Needs --tool-call-parser on the server (400 without it).",
        body: {
          model: "{{model}}",
          temperature: 0,
          messages: [{ role: "user", content: "Is it cold in Oslo?" }],
          tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }],
          tool_choice: { type: "function", function: { name: "get_weather" } },
        },
      },
      {
        name: "send tool result back",
        desc: "Round 2: give the model the tool output so it can answer in words.",
        body: {
          model: "{{model}}",
          temperature: 0,
          messages: [
            { role: "user", content: "What's the weather in Paris right now?" },
            { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } }] },
            { role: "tool", tool_call_id: "call_1", content: '{"temp_c": 14, "sky": "light rain"}' },
          ],
          tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }],
        },
      },
    ],
  },
  {
    name: "7. Thinking / reasoning models",
    desc: "Only for models with a reasoning mode (and --reasoning-parser on the server). Gemma-4 may ignore these.",
    items: [
      { name: "reasoning_effort low", desc: "On Gemma-4 setting reasoning_effort switches thinking ON (the default is off). Without --reasoning-parser on the server the thinking text lands in content (starts with \"thought\"); with it, it moves to message.reasoning_content.", body: chat({ reasoning_effort: "low", max_tokens: 512 }, "Is 391 prime?") },
      { name: "include_reasoning false", desc: "Hide the reasoning text from the response (needs --reasoning-parser on the server to separate it).", body: chat({ include_reasoning: false, max_tokens: 512 }, "Is 391 prime?") },
      { name: "chat_template_kwargs enable_thinking false", desc: "Template switch (Qwen3 style) to turn thinking off.", body: chat({ chat_template_kwargs: { enable_thinking: false } }, "Is 391 prime?") },
    ],
  },
  {
    name: "8. Streaming",
    desc: "Tokens arrive as server-sent events (data: {...}) instead of one JSON at the end.",
    items: [
      { name: "stream true", desc: "Watch tokens arrive in the response pane.", body: chat({ temperature: 0, stream: true }) },
      { name: "stream + include_usage", desc: "Last event carries token counts.", body: chat({ temperature: 0, stream: true, stream_options: { include_usage: true, continuous_usage_stats: false } }) },
    ],
  },
  {
    name: "9. Probabilities and token IDs",
    desc: "Look inside the model's choices. logprob: -0.02 ~ 98%, -0.7 ~ 50%, -2.3 ~ 10%.",
    items: [
      { name: "logprobs + top_logprobs 5", desc: "Confidence of every written token plus the 5 runners-up.", body: chat({ temperature: 0, max_tokens: 10, logprobs: true, top_logprobs: 5 }, "The capital of France is") },
      {
        name: "prompt_logprobs 1 (grade the input)",
        desc: "Scores every token you SENT: rank 1 = the model's own top choice. This is how the fidelity test judged outputs. First entry is null (nothing before it).",
        body: chat({ temperature: 0, max_tokens: 1, prompt_logprobs: 1 }, "The capital of France is Lyon"),
      },
      { name: "return_tokens_as_token_ids", desc: "Logprob tokens shown as \"token_id:1234\" instead of text.", body: chat({ temperature: 0, max_tokens: 10, logprobs: true, return_tokens_as_token_ids: true }, "The capital of France is") },
      { name: "return_token_ids", desc: "Adds prompt_token_ids and choices[].token_ids lists.", body: chat({ temperature: 0, max_tokens: 10, return_token_ids: true }, "The capital of France is") },
      { name: "echo", desc: "Prompt text repeated in front of the answer.", body: chat({ temperature: 0, max_tokens: 10, echo: true }, "The capital of France is") },
    ],
  },
  {
    name: "10. Prompt and template control",
    desc: "How messages become the string the model reads.",
    items: [
      { name: "add_generation_prompt false", desc: "No 'your turn, model' marker: the model may continue the user text instead of answering.", body: chat({ temperature: 0, max_tokens: 30, add_generation_prompt: false }, "Once upon a time") },
      { name: "skip_special_tokens false", desc: "Show special tokens like <end_of_turn> in the text.", body: chat({ temperature: 0, max_tokens: 30, skip_special_tokens: false, ignore_eos: false }, "Say hi.") },
      { name: "add_special_tokens", desc: "Add extra special tokens (e.g. <bos>) on top of the template. Usually leave false for chat.", body: chat({ temperature: 0, max_tokens: 20, add_special_tokens: false }, "Say hi.") },
      { name: "truncate_prompt_tokens + truncation_side", desc: "Keep only 20 prompt tokens, cutting from the left (oldest).", body: chat({ temperature: 0, max_tokens: 40, truncate_prompt_tokens: 20, truncation_side: "left" }, "Ignore this long preamble about nothing in particular that goes on and on. Question: what is 6 times 7?") },
      { name: "chat_template override", desc: "Use your own Jinja template for this request. Refused (400) unless the server runs with --trust-request-chat-template, because a template is code that runs on the server.", body: chat({ temperature: 0, max_tokens: 40, chat_template: "{% for m in messages %}{{ m['role'] | upper }}: {{ m['content'] }}\n{% endfor %}ASSISTANT:" }, "Say hi.") },
      { name: "documents (RAG templates)", desc: "Passed to templates that render documents; ignored if the template doesn't use them.", body: chat({ temperature: 0, documents: [{ title: "Returns policy", text: "Broken items can be returned within 30 days for a full refund." }] }, "Can I return a broken item after 2 weeks?") },
    ],
  },
  {
    name: "11. Server, scheduling, tokenizer",
    desc: "Request bookkeeping plus the tokenizer endpoints.",
    items: [
      { name: "request_id + user", desc: "Your own ID (shows in server logs) and a user label.", body: chat({ temperature: 0, max_tokens: 20, request_id: "postman-demo-1", user: "alice" }, "Say hi.") },
      { name: "priority", desc: "Lower = served first. Only with --scheduling-policy priority; otherwise rejected or ignored.", body: chat({ temperature: 0, max_tokens: 20, priority: 0 }, "Say hi.") },
      { name: "cache_salt", desc: "Prefix-cache reuse only between requests with the same salt (tenant isolation).", body: chat({ temperature: 0, max_tokens: 20, cache_salt: "tenant-a" }, "Say hi.") },
      { name: "vllm_xargs", desc: "Free-form extra args for custom logits processors/plugins.", body: chat({ temperature: 0, max_tokens: 20, vllm_xargs: { my_plugin_strength: 1 } }, "Say hi.") },
      { name: "POST /tokenize (messages)", desc: "Shows how many tokens (and which IDs) a chat becomes after the template. Use it to find IDs for logit_bias / allowed_token_ids / stop_token_ids.", path: "/tokenize", body: { model: "{{model}}", messages: [{ role: "user", content: "Hi, I am Priya" }], return_token_strs: true } },
      { name: "POST /tokenize (plain text)", desc: "Tokenize a single word, no template.", path: "/tokenize", body: { model: "{{model}}", prompt: " yes", add_special_tokens: false, return_token_strs: true } },
      { name: "POST /detokenize", desc: "Token IDs back to text.", path: "/detokenize", body: { model: "{{model}}", tokens: [2, 9259, 236764] } },
      { name: "POST /v1/completions (raw prompt, no template)", desc: "Older text-in/text-out API: you write the exact string, including any chat markers. A chat-tuned model given a bare prompt without its template can produce junk (Gemma-4 here: \"are are are...\"). Use chat completions for instruct models.", path: "/v1/completions", body: { model: "{{model}}", prompt: "The three primary colours are", max_tokens: 20, temperature: 0, logprobs: 3 } },
      { name: "GET /metrics (server counters)", desc: "Prometheus counters: requests running/waiting, prompt/generation tokens, TTFT histogram, prefix-cache hits.", method: "GET", path: "/metrics" },
    ],
  },
];

// ---------- 12. Images, video, PDF ----------
const samples = process.argv[3] ?? "samples";
const pdfText = (await Bun.file(`${samples}/invoice.txt`).text()).trim();
const pdfJpgB64 = Buffer.from(await Bun.file(`${samples}/invoice-page1.jpg`).arrayBuffer()).toString("base64");

const IMG_SIGN = "https://vllm-public-assets.s3.us-west-2.amazonaws.com/vision_model_images/stop_sign.jpg";
const IMG_PARK = "https://vllm-public-assets.s3.us-west-2.amazonaws.com/vision_model_images/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";
const VIDEO = "https://huggingface.co/datasets/raushan-testing-hf/videos-test/resolve/main/sample_demo_1.mp4";
const RED_PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const mm = (parts: unknown[], extra: Record<string, unknown> = {}) => ({
  model: "{{model}}",
  temperature: 0,
  max_tokens: 200,
  messages: [{ role: "user", content: parts }],
  ...extra,
});
const img = (url: string) => ({ type: "image_url", image_url: { url } });
const txt = (text: string) => ({ type: "text", text });

const PDF_PAGE = "data:image/jpeg;base64,{{invoice_page1_jpg_b64}}";
const INVOICE_Q = "Extract the invoice as JSON with: invoice_number, invoice_date, customer_name, po_number, line_items (description, qty, unit_price, amount), subtotal, vat, total. Amounts as plain numbers without currency symbols. Use null if a field is missing.";
const INVOICE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "invoice",
    schema: {
      type: "object",
      properties: {
        invoice_number: { type: "string" },
        invoice_date: { type: "string" },
        customer_name: { type: "string" },
        po_number: { type: ["string", "null"] },
        line_items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, qty: { type: "number" }, unit_price: { type: "number" }, amount: { type: "number" } }, required: ["description", "qty", "unit_price", "amount"] } },
        subtotal: { type: "number" },
        vat: { type: "number" },
        total: { type: "number" },
      },
      required: ["invoice_number", "invoice_date", "customer_name", "po_number", "line_items", "subtotal", "vat", "total"],
    },
  },
};

groups.push({
  name: "12. Images, video, PDF (latency vs quality)",
  desc: [
    "`content` becomes a list of parts: text + image_url / video_url. vLLM turns each image into vision tokens that sit in the prompt like text tokens, so **more vision tokens = slower prefill (TTFT) + more KV memory, but more detail**.",
    "",
    "| lever | faster | better quality | how |",
    "|---|---|---|---|",
    "| image detail | `max_soft_tokens` 70 / 140 | 560 / 1120 (small text, tables, OCR) | `mm_processor_kwargs: {\"max_soft_tokens\": N}`; Gemma-4 accepts 70, 140, 280 (default), 560, 1120 |",
    "| video frames | `num_frames` 4–8 | 16–32 (fast action, counting) | `media_io_kwargs: {\"video\": {\"num_frames\": N}}`; Gemma-4: 70 tokens/frame, max 32 frames |",
    "| image transport | base64 (no download) | same | URL = server downloads it first (adds latency, needs internet from the pod) |",
    "| PDF | text extraction (~1 token per 4 chars, exact characters) | page image at 560–1120 (keeps layout, tables, figures, scans) | vLLM has no PDF input: convert client-side (`pdftotext` / `pdftoppm`) |",
    "| order | put media **before** the question | same | the question is read last, with the image already in context |",
    "| reuse | send the same image again | same | vLLM caches processed images (and prefix-caches the prompt), so repeats are cheaper |",
    "",
    "Compare TTFT/total time in Test Results and `usage.prompt_tokens` across the 70 / 280 / 1120 requests. Server limits that apply: `--max-model-len 4096` on the reference server (32 video frames ≈ 2.5k tokens fits; 2 pages at 1120 ≈ 2.3k fits). Multiple images in one prompt may need `--limit-mm-per-prompt '{\"image\":4}'`.",
  ].join("\n"),
  items: [
    { name: "image URL (default detail 280)", desc: "Server downloads the image, encodes ~280 vision tokens.", body: mm([img(IMG_SIGN), txt("What does the sign say, and what is behind it?")]) },
    { name: "image base64 (data URL)", desc: "Image travels inside the request: no download step, works without internet on the pod. A 1×1 red pixel here; replace with any `data:image/png;base64,...`.", body: mm([img(`data:image/png;base64,${RED_PIXEL}`), txt("What colour is this image? One word.")], { max_tokens: 5 }) },
    { name: "image detail 70 (fastest)", desc: "~70 vision tokens: lowest TTFT; fine for 'what is this', poor for small text.", body: mm([img(IMG_PARK), txt("Describe this scene in detail, including any small objects far away.")], { mm_processor_kwargs: { max_soft_tokens: 70 } }) },
    { name: "image detail 1120 (most detail)", desc: "~1120 vision tokens: slower prefill, much better on small details and text. Compare prompt_tokens and time with the 70 request.", body: mm([img(IMG_PARK), txt("Describe this scene in detail, including any small objects far away.")], { mm_processor_kwargs: { max_soft_tokens: 1120 } }) },
    {
      name: "image -> JSON (schema)",
      desc: "Combine vision with structured outputs: extraction from a photo.",
      body: mm([img(IMG_SIGN), txt("Extract what you see.")], {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "scene",
            schema: {
              type: "object",
              properties: { sign_text: { type: "string" }, sign_shape: { type: "string" }, other_objects: { type: "array", items: { type: "string" } } },
              required: ["sign_text", "sign_shape", "other_objects"],
            },
          },
        },
      }),
    },
    { name: "two images, compare", desc: "Several images in one message. May need --limit-mm-per-prompt on the server.", body: mm([img(IMG_SIGN), img(IMG_PARK), txt("Image 1 vs image 2: which is urban and which is nature? One line each.")]) },
    { name: "video 8 frames (faster)", desc: "8 frames x ~78 tokens ≈ 0.6k tokens: quick summary, may miss short events.", body: mm([{ type: "video_url", video_url: { url: VIDEO } }, txt("What happens in this video? 3 bullet points.")], { media_io_kwargs: { video: { num_frames: 8 } } }) },
    { name: "video 32 frames (more detail)", desc: "32 frames (Gemma-4 max) ≈ 2.5k tokens: catches more events; ~4x the prefill of 8 frames.", body: mm([{ type: "video_url", video_url: { url: VIDEO } }, txt("What happens in this video? 3 bullet points.")], { media_io_kwargs: { video: { num_frames: 32 } } }) },
    { name: "PDF as text (pdftotext)", desc: "samples/invoice.pdf via `pdftotext -layout invoice.pdf -`. Cheapest (~450 tokens) and every character exact. Works because this PDF has a text layer and -layout keeps columns; scanned PDFs have no text layer, and multi-column papers come out jumbled.", body: chat({ temperature: 0, max_tokens: 400, response_format: INVOICE_FORMAT }, `Invoice text:\n"""\n${pdfText}\n"""\n\n${INVOICE_Q}`) },
    { name: "PDF page as image, detail 70 (too low)", desc: "Page rendered with `pdftoppm -singlefile -scale-to 1100 -jpeg invoice.pdf invoice-page1` and sent as base64 (variable invoice_page1_jpg_b64). 70 tokens for a whole page: fast, but digits and small print get misread. Check the amounts against samples/invoice.txt.", body: mm([img(PDF_PAGE), txt(INVOICE_Q)], { max_tokens: 400, response_format: INVOICE_FORMAT, mm_processor_kwargs: { max_soft_tokens: 70 } }) },
    { name: "PDF page as image, detail 280 (default)", desc: "Default detail. Usually enough for large printed text; compare amounts with 70 and 1120.", body: mm([img(PDF_PAGE), txt(INVOICE_Q)], { max_tokens: 400, response_format: INVOICE_FORMAT, mm_processor_kwargs: { max_soft_tokens: 280 } }) },
    { name: "PDF page as image, detail 1120 (OCR quality)", desc: "Max detail: best for small print, tables, scans. Slowest prefill. Compare accuracy and time with 70 / 280.", body: mm([img(PDF_PAGE), txt(INVOICE_Q)], { max_tokens: 400, response_format: INVOICE_FORMAT, mm_processor_kwargs: { max_soft_tokens: 1120 } }) },
    { name: "PDF text + page image together", desc: "Belt and braces: exact characters from the text layer, layout from the image (560). Most robust for important documents, highest token cost.", body: mm([img(PDF_PAGE), txt(`Text layer of the same page:\n"""\n${pdfText}\n"""\n\n${INVOICE_Q}`)], { max_tokens: 400, response_format: INVOICE_FORMAT, mm_processor_kwargs: { max_soft_tokens: 560 } }) },
  ],
});

// ---------- 13. Hosted APIs (OpenAI, Google) ----------
groups.push({
  name: "13. Hosted APIs: OpenAI, Google Vertex AI, Gemini API",
  desc: [
    "Requests that use only **standard OpenAI fields**, so they also work against hosted, OpenAI-compatible APIs. Choose one of the hosted environments and fill in `api_key` (and `model`).",
    "",
    "| provider | api_base | api_key | model example |",
    "|---|---|---|---|",
    "| OpenAI | `https://api.openai.com/v1` | API key from platform.openai.com (`sk-...`) | a current OpenAI chat model |",
    "| Google Vertex AI | `https://{{gcp_region}}-aiplatform.googleapis.com/v1/projects/{{gcp_project}}/locations/{{gcp_region}}/endpoints/openapi` | output of `gcloud auth print-access-token` (expires after ~1 hour) | `google/<gemini model>` |",
    "| Gemini API (AI Studio) | `https://generativelanguage.googleapis.com/v1beta/openai` | API key from aistudio.google.com | `<gemini model>` |",
    "| vLLM with --api-key | `{{server}}/v1` | the value passed to --api-key | your served model name |",
    "",
    "vLLM-only fields from folders 2–12 (`top_k`, `min_p`, `structured_outputs`, `prompt_logprobs`, `mm_processor_kwargs`, …) and vLLM-only routes (`/tokenize`, `/metrics`) are **not** part of the OpenAI API: hosted providers reject or ignore them. Check the error message, and the provider's docs for the fields it supports.",
  ].join("\n"),
  items: [
    { name: "list models", desc: "GET {{api_base}}/models: which model ids this key can use (not every provider supports it).", method: "GET", path: "/v1/models" },
    { name: "minimal chat", desc: "The smallest portable request. 401 = wrong or expired key; 404 = wrong api_base or model.", body: { model: "{{model}}", messages: [{ role: "user", content: "Say hello in 5 words." }] } },
    { name: "system + sampling + limit", desc: "Portable fields: system message, temperature, top_p, max_completion_tokens (the newer name for max_tokens; some newer models only accept this one), stop, seed.", body: { model: "{{model}}", messages: [{ role: "system", content: "Answer in one sentence." }, { role: "user", content: "{{prompt}}" }], temperature: 0.2, top_p: 0.9, max_completion_tokens: 200, stop: ["\n\n\n"], seed: 42 } },
    { name: "json_schema (portable structured output)", desc: "response_format json_schema is the portable way to get structured output (no vLLM structured_outputs).", body: { model: "{{model}}", temperature: 0, max_completion_tokens: 300, messages: [{ role: "user", content: `${EMAIL}\nReturn JSON with exactly these fields: name, order_id (the number after #, as an integer), date, problem, phone, email. Use null for any field that is not in the text.` }], response_format: COMPLAINT_FORMAT } },
    { name: "image (base64)", desc: "Image as a data URL: works the same across OpenAI-compatible vision models (no mm_processor_kwargs).", body: { model: "{{model}}", max_completion_tokens: 400, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,{{invoice_page1_jpg_b64}}" } }, { type: "text", text: "What is the invoice number and the total due?" }] }] } },
    { name: "streaming + usage", desc: "stream + stream_options.include_usage are standard OpenAI fields.", body: { model: "{{model}}", messages: [{ role: "user", content: "{{prompt}}" }], max_completion_tokens: 200, stream: true, stream_options: { include_usage: true } } },
    { name: "logprobs", desc: "logprobs + top_logprobs are standard (prompt_logprobs is not). Some providers or models don't return logprobs.", body: { model: "{{model}}", messages: [{ role: "user", content: "The capital of France is" }], max_completion_tokens: 10, logprobs: true, top_logprobs: 3 } },
    { name: "tools", desc: "Function calling is standard on hosted APIs (no server flags needed there).", body: { model: "{{model}}", messages: [{ role: "user", content: "What's the weather in Paris right now?" }], tools: [{ type: "function", function: { name: "get_weather", description: "Current weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }], tool_choice: "auto" } },
  ],
});

const testScript = [
  "if (pm.response.code !== 200) { console.log(pm.response.text()); return; }",
  "const ct = pm.response.headers.get('Content-Type') || '';",
  "if (!ct.includes('application/json')) return;",
  "const j = pm.response.json();",
  "if (!j.choices) return;",
  "const c = j.choices[0];",
  "pm.test(`finish_reason: ${c.finish_reason}`, () => true);",
  "if (j.usage) { const s = pm.response.responseTime / 1000; pm.test(`tokens in/out: ${j.usage.prompt_tokens}/${j.usage.completion_tokens}  (${(j.usage.completion_tokens / s).toFixed(1)} tok/s incl. prefill)`, () => true); }",
  "const txt = c.message ? (c.message.content ?? JSON.stringify(c.message.tool_calls)) : c.text;",
  "console.log(txt);",
];

// OpenAI-compatible routes live under {{api_base}} (e.g. http://host:8000/v1, https://api.openai.com/v1, or a
// Vertex AI ".../endpoints/openapi" base). vLLM-only routes (/health, /tokenize, /metrics, ...) live under {{server}}.
const urlFor = (path: string) => {
  const m = path.match(/^\/v1(\/.*)$/);
  const [base, rest] = m ? ["{{api_base}}", m[1]] : ["{{server}}", path];
  return { raw: `${base}${rest}`, host: [base], path: rest.replace(/^\//, "").split("/") };
};

const toItem = (r: Req) => {
  const method = r.method ?? "POST";
  const path = r.path ?? "/v1/chat/completions";
  const request: Record<string, unknown> = {
    method,
    description: r.desc,
    header: method === "POST" ? [{ key: "Content-Type", value: "application/json" }] : [],
    url: urlFor(path),
  };
  if (r.body) {
    const clean = JSON.parse(JSON.stringify(r.body)); // drops undefined keys
    request.body = { mode: "raw", raw: JSON.stringify(clean, null, 2), options: { raw: { language: "json" } } };
  }
  return { name: r.name, request, response: [] };
};

const collection = {
  info: {
    name: "LLM request payload options: every request field with an example",
    description:
      "Companion collection for the llm-model-requestpayload-options tutorial: one request per vLLM /v1/chat/completions option, grouped into lessons, plus images, video and PDF.\n\n**Setup:** pick an environment (top right) or edit the collection variables: `server` (vLLM root, for /health, /tokenize, /metrics), `api_base` (OpenAI-compatible base, normally {{server}}/v1), `model`, and `api_key`.\n\n**Auth:** every request inherits a Bearer Token (collection → Authorization tab) with `{{api_key}}`. Leave it empty for a local vLLM without --api-key; set it for vLLM with --api-key, OpenAI, Google Vertex AI (gcloud auth print-access-token) or the Gemini API (API key). Folder 13 has requests that use only standard OpenAI fields, for hosted APIs.\n\n Test Results shows finish_reason, token counts and time; the Console shows the answer text. A 400 response means this model or server flag does not support that field, and the message says why. See README.md and lessons/.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "server", value: "http://localhost:8000" },
    { key: "api_base", value: "{{server}}/v1" },
    { key: "api_key", value: "" },
    { key: "model", value: "gemma-4-31b" },
    { key: "prompt", value: "Explain what a GPU is in two sentences." },
    { key: "invoice_page1_jpg_b64", value: pdfJpgB64 },
  ],
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{api_key}}", type: "string" }] },
  event: [{ listen: "test", script: { type: "text/javascript", exec: testScript } }],
  item: groups.map((g) => ({ name: g.name, description: g.desc, item: g.items.map(toItem) })),
};

await Bun.write(out, JSON.stringify(collection, null, 2) + "\n");
const n = groups.reduce((a, g) => a + g.items.length, 0);
console.log(`wrote ${out}: ${groups.length} folders, ${n} requests`);
