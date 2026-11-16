# Lesson 7: Thinking (reasoning) models

**Goal:** turn "thinking before answering" on or off, and keep it out of your answer text.

## The idea

Some models can write out step-by-step reasoning before the final answer. It often improves maths and logic, but
every reasoning token costs time.

| field | example | effect |
|---|---|---|
| `reasoning_effort` | `"low"` / `"medium"` / `"high"` | how much to think (models that support it) |
| `include_reasoning` | `false` | drop the reasoning from the response |
| `chat_template_kwargs` | `{"enable_thinking": false}` | template switch used by some models (e.g. Qwen3) |

With `--reasoning-parser <name>` on the server, vLLM separates the two parts: reasoning goes to
`message.reasoning_content` and the answer to `message.content`. Without it, both arrive mixed in `content`.

## Try it (folder 7): "Is 391 prime?"

| request | reference result (Gemma-4, no reasoning parser) |
|---|---|
| reasoning_effort low | **thinking switched on**: hit the 512-token limit after 74 s, no final answer; `content` starts with `thought` |
| include_reasoning false | direct answer: "No, 391 is not a prime number", 250 tokens of explanation, 36 s |
| enable_thinking false | direct answer, cut at 128 tokens |

## Request and response

**Request** (*reasoning_effort low*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Is 391 prime?" }],
  "max_tokens": 512,
  "reasoning_effort": "low"     // on Gemma-4 this switches thinking ON
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": {
      "content": "thought\nThe number is 391.\nA prime number is a natural number greater than 1 that has no positive divisors other than 1 and itself.\n\n    *   *Is it even?* No…"
      // ^ the thinking text, mixed into content, because the server has no --reasoning-parser
    },
    "finish_reason": "length"   // 512 tokens of thinking and still no answer
  }],
  "usage": { "prompt_tokens": 23, "completion_tokens": 512 }   // 74 seconds
}
```

**With `--reasoning-parser gemma4` on the server**, the two parts come back in separate fields (illustration of
the shape; the reference server ran without the parser):

```jsonc
"message": {
  "reasoning_content": "The number is 391. … 17 × 23 = 391 …",   // the thinking
  "content": "No, 391 is not prime: 391 = 17 × 23."               // the answer only
}
```

## What this shows

- On Gemma-4, thinking is **off by default**, and sending `reasoning_effort` turns it **on**.
- Without a reasoning parser, the thinking text leaks into `content`, which would break JSON parsing.
- 391 = 17 × 23 is easy enough that the model gets it right without thinking. With thinking on and only 512
  tokens, it never reached an answer at all.

## Latency and quality

| | latency | quality |
|---|---|---|
| thinking off | fast | fine for lookup, extraction, simple Q&A |
| thinking on | 5–20x more output tokens | better on multi-step maths, logic, planning |

Give thinking requests a large `max_tokens`. Otherwise the reasoning uses up the budget and no answer is left.

## Exercise

Ask a harder question, e.g. "How many Sundays were there in 2025?", with and without `reasoning_effort`. Which one
gets it right, and at what time cost?
