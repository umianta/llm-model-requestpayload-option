# Lesson 11: Server, scheduling and the tokenizer

**Goal:** bookkeeping fields, plus the endpoints that show you what the model really reads.

## Request bookkeeping

| field | example | effect |
|---|---|---|
| `request_id` | `"job-17"` | your own ID; shows up in server logs |
| `user` | `"alice"` | a label for tracking |
| `priority` | `0` | lower = served first, only with `--scheduling-policy priority` |
| `cache_salt` | `"tenant-a"` | prefix-cache reuse only between requests with the same salt (tenant isolation) |
| `vllm_xargs` | `{"key": 1}` | free-form arguments for custom plugins |

These don't change the answer. In the reference run, all four returned the same "Hi!".

## Tokenizer endpoints

| request | reference result |
|---|---|
| POST /tokenize (messages) | 4 words → **18 tokens**: `<bos>`, `<|turn>`, `user`, newlines and the turn markers count too |
| POST /tokenize (plain text) | `" yes"` → one token, 11262 (`▁yes`; `▁` means "starts with a space") |
| POST /detokenize | `[2, 9259, 236764]` → `"<bos>Hello,"` |

Use `/tokenize` to:
- count tokens before sending (cost and context limits)
- find IDs for `logit_bias`, `allowed_token_ids` and `stop_token_ids`
- see the exact chat template output (`return_token_strs: true`)

## Request and response: `/tokenize`

**Request** (*POST /tokenize (messages)*): note the different URL, `POST {{server}}/tokenize`.

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Hi, I am Priya" }],   // same shape as a chat request
  "return_token_strs": true                                       // show the text of each token, not just IDs
}
```

**Response:**

```jsonc
{
  "count": 18,                 // prompt_tokens this message would cost
  "max_model_len": 4096,       // the server's context limit (prompt + output)
  "tokens":     [2,       105,       2364,   107,  10979, 236764, 564,  1006,  212546,   106,       107,  105,       4368,    107,  100,          45518,     107,  101],
  "token_strs": ["<bos>", "<|turn>", "user", "\n", "Hi",  ",",    "▁I", "▁am", "▁Priya", "<turn|>", "\n", "<|turn>", "model", "\n", "<|channel>", "thought", "\n", "<channel|>"]
  //             start    user turn begins       your 5 tokens                    user turn ends      model turn begins       empty thinking block
}
```

## `/v1/completions`: the raw API

**Request:** `POST {{api_base}}/completions`. It takes `prompt` (a plain string) instead of `messages`.

```jsonc
{ "model": "gemma-4-31b", "prompt": "The three primary colours are", "max_tokens": 20, "temperature": 0, "logprobs": 3 }
```

**Response** (trimmed):

```jsonc
{
  "object": "text_completion",                 // not chat.completion
  "choices": [{
    "text": " are are are are額額額額額額額…",    // "text", not "message.content"
    "logprobs": {                              // the older logprobs format: parallel lists
      "tokens":         [" are", " are", " are", " are", "額", …],
      "token_logprobs": [-0.27,  -0.05,  -0.37,  -0.06,  -0.32, …],
      "top_logprobs":   [{ " are": -0.27, " the": -1.58, "額": -4.27 }, …]
    },
    "finish_reason": "length"
  }]
}
```

You write the exact prompt string and no chat template is applied. In the reference run, the instruct-tuned
Gemma-4 answered the bare prompt *"The three primary colours are"* with **"are are are are 額額額…"**. Chat-tuned
models expect their template. Use `/v1/completions` only for base models, or when you build the template yourself.

## `/metrics`

Server-wide Prometheus counters: `vllm:num_requests_running` and `vllm:num_requests_waiting` (load),
`vllm:prompt_tokens_total` and `vllm:generation_tokens_total` (work done), `vllm:time_to_first_token_seconds` (TTFT
histogram), and prefix-cache hit counters. Send a few requests and watch them change.

## Exercise

Tokenize `"Yes"`, `" yes"` and `"YES"`. Are they the same token? What does that mean for `bad_words` (lesson 4)?
