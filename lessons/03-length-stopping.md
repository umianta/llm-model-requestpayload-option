# Lesson 3: Length and stopping

**Goal:** control when the model stops, and learn to read `finish_reason`.

## The idea

The model stops when one of these happens first:
- it emits its own end-of-turn token (**natural end**)
- it writes one of your `stop` strings or `stop_token_ids`
- it reaches `max_tokens`

`choices[0].finish_reason` tells you which: `stop` means the first two, `length` means it was **cut off**.

| field | example | effect |
|---|---|---|
| `max_tokens` / `max_completion_tokens` | `256` | Upper limit on output tokens (same thing, two names). |
| `min_tokens` | `100` | The end-of-turn token is blocked until 100 tokens. |
| `stop` | `["\n\n", "END"]` | Stop when this text appears; it's removed from the output. |
| `include_stop_str_in_output` | `true` | Keep the stop text in the output. |
| `stop_token_ids` | `[107]` | Stop on exact token IDs (107 = newline in Gemma-4). |
| `ignore_eos` | `true` | Ignore the end-of-turn token and always write exactly `max_tokens`. |

## Try it (folder 3)

| request | reference result |
|---|---|
| max_tokens 20 | `[length]` "A GPU, or Graphics Processing Unit, is a specialized processor designed to handle many mathematical calculations simultaneously." (the second sentence never comes) |
| stop strings | "1. Apple 2. Banana 3. Orange" (stopped before "4.") |
| include_stop_str_in_output | "1. Apple 2. Banana 3. Orange 4." |
| stop_token_ids `[107]` | one line of the poem only |
| min_tokens 100 | **"OK." followed by ~150 tokens of 🌻🌻🌻** |
| ignore_eos | **"Hi! hi! hi! hi! …"** |

## Request and response

**Request** (*stop strings*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "List 10 fruits, numbered 1. to 10." }],
  "max_tokens": 128,
  "temperature": 0,
  "stop": ["4.", "\n\n\n"]     // stop as soon as either string appears
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": { "content": "1. Apple\n2. Banana\n3. Orange\n" },  // "4." itself is removed
    "finish_reason": "stop",       // "stop" covers BOTH a natural end and a stop string…
    "stop_reason": "4."            // …so this vLLM field tells you which: the string, or a token ID like 106
  }],
  "usage": { "prompt_tokens": 28, "completion_tokens": 14 }
}
```

**Compare with a cut-off** (*max_tokens 20*): `"max_tokens": 20` →

```jsonc
{
  "choices": [{
    "message": { "content": "A GPU, or Graphics Processing Unit, is a specialized processor designed to handle many mathematical calculations simultaneously." },
    "finish_reason": "length"      // hit the limit: the second sentence never came
                                   // (no stop_reason: nothing "stopped" it, it ran out of budget)
  }],
  "usage": { "completion_tokens": 20 }   // exactly max_tokens
}
```

## The lesson in those last two rows

Forcing the model past its natural end doesn't make it say more useful things. It produces junk. `min_tokens` and
`ignore_eos` exist for **benchmarks** (fixed output length), not for getting longer answers. To get longer answers,
ask for them in the prompt ("in about 300 words").

## Latency and quality

- `max_tokens` is your main latency limit: total time ≈ TTFT + output tokens × time per token.
- Set it **high enough**. A cut-off answer (`finish_reason: length`) is incomplete, and cut-off JSON is invalid.
- `stop` is a cheap way to save time when you only need the first part, e.g. one line or one list item.

## Exercise

Change *stop strings* to `"stop": ["Banana"]`. What comes back, and is "Banana" in the text?
