# Lesson 2: Randomness (sampling)

**Goal:** control how the next token is picked, from "always the same answer" to "creative".

## The idea

At every step the model gives a probability to every token in its vocabulary (Gemma-4: ~262,000 tokens). Sampling
settings decide which one gets picked.

| field | example | effect |
|---|---|---|
| `temperature` | `0` | Always pick the most likely token. The same input gives the same output. |
| | `0.7` | Some variety: good for chat. |
| | `1.2` | Flatter odds: more surprising, sometimes nonsense. |
| `top_p` | `0.9` | Only consider the most likely tokens that together make up 90% of the probability. |
| `top_k` | `40` | Only consider the 40 most likely tokens. |
| `min_p` | `0.05` | Drop tokens less than 5% as likely as the best one. |
| `seed` | `42` | Makes random sampling repeatable. |
| `n` | `3` | Several independent answers in one request (`choices[0..2]`). |
| `use_beam_search` | `true` | Explores several candidate continuations and keeps the best-scoring one. |

## Try it (folder 2)

Send each request **twice** and compare.

| request | what to notice |
|---|---|
| temperature 0 | Both runs give identical text. |
| temperature 1.2 | Usually different each time. The first words may still match, because the top token is often very likely. |
| top_p / top_k / min_p | Variety, but junk tokens are cut off. |
| seed 42 | Random, but repeatable: the same seed gives the same text. |
| n 3 | Three different coffee-shop name lists. |
| beam search | ~10x slower here, and it leaked end-of-turn markers (`<turn|>`) into the text on Gemma-4. |

## Reference run findings

- `min_p` works on a normal server, but returns HTTP 400 if the server uses speculative decoding (`--speculative-config`).
- Beam search took ~7 s for one short sentence, and leaked `<turn|>` markers into the text.

## Request and response

**Request** (*n 3*): three samples in one call.

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Suggest a name for a coffee shop." }],
  "max_tokens": 40,
  "temperature": 0.9,    // randomness on, so the three answers differ
  "n": 3                 // number of answers
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [                                   // n = 3 → three entries, index 0..2
    { "index": 0, "message": { "content": "…by category:\n\n### 1. Cozy & Classic…" },  "finish_reason": "length" },
    { "index": 1, "message": { "content": "…by the atmosphere of the shop:\n\n### 1. Modern & Minimalist…" }, "finish_reason": "length" },
    { "index": 2, "message": { "content": "…by category:\n\n### 1. Cozy & Warm (The \"Neighborhood Spot\")…" }, "finish_reason": "length" }
  ],
  "usage": {
    "prompt_tokens": 21,         // the prompt is read ONCE for all three answers
    "completion_tokens": 120     // 3 × 40: every answer counts
  }
}
```

All three hit `max_tokens: 40` (`finish_reason: "length"`). The model wanted to write a long list, and 40 tokens
wasn't enough.

**Request with a different setting** (*min_p 0.05*): only the sampling fields change, and the response shape stays the same.

```jsonc
{ "model": "gemma-4-31b", "messages": [ … ], "max_tokens": 128, "temperature": 0.8, "min_p": 0.05 }
```

## Latency and quality

- Sampling settings cost almost nothing in speed.
- For **extraction, classification and JSON** use `temperature: 0`. Randomness only adds errors there.
- For **creative text** use `temperature 0.7–1.0` with `top_p 0.9`.
- `n > 1` is cheaper than sending separate requests, because the prompt is prefilled once.

## Exercise

Send *n 3* with `temperature: 0`. Are the three answers different? Why not?
