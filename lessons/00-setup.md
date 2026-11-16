# Lesson 0: Setup and how a request works

**Goal:** get a server answering, and understand what happens to your request on the way to the model and back.

## What happens when you click Send

```
your JSON → vLLM server → chat template → tokenizer → token IDs → GPU model → token IDs → text → JSON reply
```

1. **You send JSON.** It holds the *content* (`messages`) and the *settings* (`temperature`, `max_tokens`, …).
   The model never reads the settings: they control how vLLM picks words, not what the model sees.
2. **The chat template** turns your messages into one long string with special markers the model was trained on.
   For Gemma-4 that looks roughly like `<bos><|turn>user\nHi<turn|>\n<|turn>model\n`. The last marker means
   "your turn to answer".
3. **The tokenizer** turns that string into numbers (token IDs). One token is roughly ¾ of an English word.
4. **The model runs on the GPU** in two phases:
   - **Prefill:** it reads all prompt tokens in one pass. This decides **TTFT** (time to first token).
   - **Decode:** it writes one token per step. Each step it scores every possible next token, and vLLM picks one
     according to your settings. This decides **speed per token**.
5. **Back to you:** vLLM turns the output tokens back into text, wraps it in JSON, and sends it.

Keep this picture in mind. Every lesson changes one step:
- Lessons 1 and 10 change what the model reads.
- Lessons 2–5 change how the next token is picked.
- Lessons 8, 9 and 11 change what comes back to you.
- Lesson 12 adds images and video to the prompt.
- Lesson 13 sends the same requests to hosted APIs with a bearer token.

## Import the collection

1. Postman → **Import** → `postman/llm-model-requestpayload-options.postman_collection.json`.
2. Import `postman/environments/*.json` too, then pick one in the top-right environment selector.
   Or open the collection's **Variables** tab and set:
   - `server`: your vLLM server, e.g. `http://localhost:8000` (used by /health, /tokenize, /metrics)
   - `api_base`: the OpenAI-compatible base, normally `{{server}}/v1` (used by chat, completions, models)
   - `api_key`: leave empty for a local vLLM; see [lesson 13](13-hosted-apis.md) for keys
   - `model`: the name from *0. Server info → list models* (the `id` field)
3. Send **0. Server info → health**. A `200` means you're ready.

Every request has a description: open the request, then the **Docs** icon on the right. After sending, check
**Test Results** (`finish_reason`, token counts, speed) and the **Console** (answer text).

## Server flags

Most fields work on any vLLM server. A few need the server started with extra flags, and without them you get an
HTTP 400 that says which flag is missing.

| lesson | feature | server flag |
|---|---|---|
| 6 | tool / function calling | `--enable-auto-tool-choice --tool-call-parser <name>` (`gemma4` for Gemma-4) |
| 7 | separate the "thinking" text from the answer | `--reasoning-parser <name>` (`gemma4` for Gemma-4) |
| 10 | a chat template sent inside the request | `--trust-request-chat-template` |
| 11 | `priority` actually reorders requests | `--scheduling-policy priority` |
| 12 | more than one image per prompt | `--limit-mm-per-prompt '{"image":4}'` (if the default is lower) |
| 2, 4 | `min_p`, `logit_bias` | **not** supported together with speculative decoding (`--speculative-config`) on vLLM 0.28. Use a server without it. |

The reference server ran **without** the tool, reasoning and template flags, so you can see the error messages in
`results/`.

## Request and response: field by field

Every later lesson shows a request and its response like the one below. These are real payloads captured from
the reference server (`results/payloads/gemma4-31b/`), trimmed to the important parts. `//` lines are notes, not
JSON.

**Request** (*1. Content → minimal request*): `POST {{api_base}}/chat/completions` (= `{{server}}/v1/chat/completions`)

```jsonc
{
  "model": "gemma-4-31b",                                   // must match an id from GET /v1/models
  "messages": [
    { "role": "user", "content": "Say hello in 5 words." }  // the conversation; here just one user turn
  ]
  // nothing else: every other field uses the server default (temperature from the model's config, etc.)
}
```

**Response** (HTTP 200, 1.2 s total, first token after 161 ms):

```jsonc
{
  "id": "chatcmpl-9b5a9fe8465b858b",          // unique per request: quote it when searching server logs
  "object": "chat.completion",                // "chat.completion.chunk" when streaming (lesson 8)
  "created": 1794800215,                      // Unix time in seconds
  "model": "gemma-4-31b",
  "choices": [                                // one entry per answer; several with n > 1 (lesson 2)
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello, how are you doing?"   // THE ANSWER
      },
      "logprobs": null,                       // filled in when you ask for logprobs (lesson 9)
      "finish_reason": "stop",                // why it stopped: "stop" = finished naturally or hit a stop string,
                                              // "length" = hit max_tokens (answer is cut off!), "tool_calls" (lesson 6)
      "stop_reason": 106                      // vLLM extra: WHAT stopped it. 106 = Gemma-4's end-of-turn token;
                                              // a stop string shows up here as text, e.g. "4." (lesson 3)
    }
  ],
  "system_fingerprint": "vllm-0.28.0-b98077e4",   // server version: changes when the server is upgraded
  "usage": {
    "prompt_tokens": 20,                      // tokens the model READ: your 5 words + the chat template's markers
    "completion_tokens": 8,                   // tokens the model WROTE
    "total_tokens": 28                        // what you pay for on a hosted API
  }
}
```

What to check first in any response:
1. **`finish_reason`**: `length` means the answer is incomplete.
2. **`usage`**: `prompt_tokens` drives TTFT and context use; `completion_tokens` drives total time.
3. **HTTP status**: on a 400 the body is `{"error": {"message": "...", "type": "BadRequestError", "code": 400}}`, and
   the message says which field or server flag is the problem.

## Exercise

Send *11. Server, scheduling, tokenizer → POST /tokenize (messages)*. The message is 4 words, so why does it count
18 tokens? Look at `token_strs`.

(Answer: `<bos>`, `<|turn>`, `user`, `\n` … `<turn|>`, `\n`, `<|turn>`, `model`, `\n` are the chat template's markers,
and Gemma-4 also adds an empty thinking block, `<|channel>thought\n<channel|>`. Only 5 of the 18 tokens are your
words: `Hi`, `,`, `▁I`, `▁am`, `▁Priya`.)
