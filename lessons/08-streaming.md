# Lesson 8: Streaming

**Goal:** show tokens as they're produced, and measure TTFT.

## The idea

Without streaming you wait for the whole answer. With `"stream": true` the server sends each new piece as a
server-sent event.

## Request and response

**Request** (*stream + include_usage*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Explain what a GPU is in two sentences." }],
  "max_tokens": 128,
  "temperature": 0,
  "stream": true,
  "stream_options": { "include_usage": true }   // add token counts at the end
}
```

**Response** (`Content-Type: text/event-stream`): one `data:` line per event, real capture, shortened:

```
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"A"},"finish_reason":null}]}
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" GPU"},"finish_reason":null}]}
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":","},"finish_reason":null}]}
… 47 more events …
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop","stop_reason":106}]}
data: {"id":"chatcmpl-b239…","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":22,"completion_tokens":51,"total_tokens":73}}
data: [DONE]
```

How to read it:
- The first event carries `role`; after that, each `delta.content` is the **next piece** of text. Concatenate them all.
- `object` is `chat.completion.chunk` instead of `chat.completion`, and the answer is in `delta`, not `message`.
- `finish_reason` is `null` until the second-to-last event.
- With `include_usage`, the last real event has an empty `choices` list and the token counts.
- `data: [DONE]` means the stream is over.

| field | example | effect |
|---|---|---|
| `stream` | `true` | send pieces as they're produced |
| `stream_options.include_usage` | `true` | token counts in the last event |
| `stream_options.continuous_usage_stats` | `true` | token counts in every event |

## Two latency numbers

- **TTFT (time to first token):** how long until the first piece arrives. This is mostly prefill, so it grows with
  prompt length and image or video size.
- **TPOT (time per output token):** the gap between pieces. This is decode speed, which speculative decoding
  improves.

Total time ≈ TTFT + output tokens × TPOT. Streaming doesn't make the total shorter, but users see text after TTFT
instead of after the total time, so it *feels* much faster.

## Try it (folder 8)

Send *stream true* and watch the response pane fill in. `scripts/run-collection.ts` streams every request this way,
so `results/*.md` shows TTFT and total time side by side.

## Exercise

In `results/gemma4-31b-mtp.md`, find a request with a short prompt and a long answer, and one with a long prompt
(an image) and a short answer. Which has the higher TTFT? Which has the higher total time?
