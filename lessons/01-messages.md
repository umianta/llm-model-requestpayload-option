# Lesson 1: Messages

**Goal:** understand the only two required fields, `model` and `messages`.

## The idea

The model has no memory between requests. Everything it knows about the conversation is in `messages`, which you
send again every time.

| role | who | use it for |
|---|---|---|
| `system` | you, as the app | rules and persona: "Answer in one sentence", "You extract invoices" |
| `user` | the person | questions, documents, images |
| `assistant` | earlier model replies | conversation history, or text you want the model to continue (lesson 5) |
| `tool` | your code | results of a tool call (lesson 6) |

## Try it (folder 1)

| request | what to notice |
|---|---|
| minimal request | Only `model` + `messages`. Everything else uses defaults. |
| system + multi-turn | The pirate persona from `system` sticks. "And times 3?" only makes sense because the earlier turns were sent. |

**Reference run:** the multi-turn request answered *"That be 12 pieces o' eight, ye scurvy dog!"*: in character
and using the earlier "4".

## Request and response

**Request** (*system + multi-turn*):

```jsonc
{
  "model": "gemma-4-31b",
  "max_tokens": 64,
  "messages": [
    { "role": "system",    "content": "You are a pirate. Answer in one sentence." },  // rules for the whole chat
    { "role": "user",      "content": "What is 2+2?" },
    { "role": "assistant", "content": "Arr, that be 4, matey!" },                    // an earlier reply, sent back by you
    { "role": "user",      "content": "And times 3?" }                               // the new question: only makes sense with history
  ]
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": { "role": "assistant", "content": "That be 12 pieces o' eight, ye scurvy dog!" },  // 4 × 3, in character
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 61, "completion_tokens": 16, "total_tokens": 77 }
  // 61 prompt tokens: the WHOLE history is read again on every request
}
```

To continue the chat, append this `message` to your `messages` list, add the next user turn, and send everything
again.

## Why it matters for latency

The whole conversation is **prefilled** again on every request, so long chats get slower to start (higher TTFT).
vLLM's prefix cache helps: if the start of the prompt is identical to an earlier request, that part is reused
instead of recomputed. So keep the system prompt and old turns **byte-identical** between requests, and add new
text only at the end.

## Exercise

Delete the `assistant` turn from *system + multi-turn* and send it again. What does the model think "And times 3?"
refers to now?
