# Lesson 4: Repetition and banned words

**Goal:** steer which tokens are allowed or discouraged.

## The idea

These fields change the scores of specific tokens *before* sampling.

| field | example | effect |
|---|---|---|
| `frequency_penalty` | `1.0` | The more often a token has appeared, the bigger its penalty (range −2 to 2). |
| `presence_penalty` | `1.0` | A flat penalty for any token that has appeared at all: pushes toward new topics. |
| `repetition_penalty` | `1.15` | vLLM's multiplier version (1.0 = off). |
| `bad_words` | `["blue"]` | Never generate this word. |
| `logit_bias` | `{"9079": -100}` | Push a token ID up or down. −100 effectively bans it. |
| `allowed_token_ids` | `[10784, 3771]` | **Only** these token IDs may be picked. |

Token IDs are specific to each model. Find them with *11 → POST /tokenize (plain text)*. For Gemma-4:
`Yes` = 10784, `No` = 3771, ` Paris` = 9079, newline = 107.

## Try it (folder 4)

| request | reference result | lesson |
|---|---|---|
| frequency / presence / repetition penalty | three different descriptions of the sea | small, subtle effects at these values |
| bad_words `["blue","Blue"]` | **"BLUE"** | a word ban is tokenization-specific: "BLUE" is a different token, so it slipped through |
| logit_bias −100 on ` Paris` and `Paris` | **"\*\*paris\*\*"** | same leak: lowercase `paris` after `**` is a different token, so the model routed around the ban |
| allowed_token_ids `[Yes, No]` | answers with exactly one of them | a 1-token classifier with zero formatting risk |

## Request and response

**Request** (*allowed_token_ids*): a yes/no answer that can't be anything else.

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Is water wet? Answer yes or no." }],
  "max_tokens": 1,                        // one token is all we need
  "temperature": 0,
  "allowed_token_ids": [10784, 3771]      // "Yes", "No" in Gemma-4's vocabulary (from POST /tokenize)
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": { "content": "Yes" },
    "finish_reason": "length"             // "length" because max_tokens = 1 was reached: expected here
  }],
  "usage": { "prompt_tokens": 22, "completion_tokens": 1 }   // 156 ms total: the cheapest possible classifier
}
```

**Request** (*logit_bias*): ban the answer and see what happens.

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "The capital of France is" }],
  "max_tokens": 20,
  "temperature": 0,
  "logit_bias": { "9079": -100, "50429": -100 }    // token IDs (as strings!) for " Paris" and "Paris"; -100 = banned
}
```

**Response:** `"content": "**paris**"`. The model still wanted to say Paris, so it found other tokens (`**` then
lowercase `paris`). A ban on token IDs is not a ban on an idea.

## Latency and quality

- No speed cost.
- Penalties above ~1.5 hurt quality: the model starts avoiding words it actually needs ("the", the user's name).
- `bad_words` is leaky: it misses case and spelling variants. To *guarantee* the allowed answers, use
  `allowed_token_ids` or `structured_outputs.choice` (lesson 5).
- `logit_bias` and `min_p` are rejected (HTTP 400) on servers that use speculative decoding.

## Exercise

Add `"BLUE"` and `" blue"` to `bad_words`. What does the model pick now?
