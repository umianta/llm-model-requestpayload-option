# Lesson 10: Prompt and template control

**Goal:** control how `messages` become the string the model reads.

## The idea

Each chat model was trained with its own markup, its **chat template**. vLLM applies it for you. These fields let you
change that step.

| field | example | effect |
|---|---|---|
| `add_generation_prompt` | `false` | leave off the "model's turn" marker at the end |
| `continue_final_message` | `true` | continue your last `assistant` message instead of starting a new one (lesson 5) |
| `chat_template` | a Jinja string | use your own template for this request |
| `chat_template_kwargs` | `{"enable_thinking": false}` | pass switches into the template |
| `skip_special_tokens` | `false` | show markers like `<turn|>` in the output |
| `add_special_tokens` | `true` | add extra special tokens (e.g. `<bos>`) on top of the template |
| `truncate_prompt_tokens` | `20` | keep only the last N prompt tokens |
| `truncation_side` | `"left"` | cut from the start (`left`) or the end (`right`) |
| `documents` | `[{"title":…, "text":…}]` | documents for templates that support RAG |

## Try it (folder 10)

| request | reference result | lesson |
|---|---|---|
| add_generation_prompt false | "thought ...in a kingdom carved from iridescent sea-glass…" | without the turn marker the model is confused about whose turn it is |
| truncate_prompt_tokens 20, left | "6 times 7 is 42." | the long preamble was cut and only the question survived |
| chat_template override | HTTP 400: *--trust-request-chat-template is not set* | a template is code that runs on the server, so it's off by default |
| documents | a generic answer about return policies | Gemma-4's template ignores `documents`, so the model never saw the 30-day policy |

## Request and response

**Request** (*truncate_prompt_tokens + truncation_side*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Ignore this long preamble about nothing in particular that goes on and on. Question: what is 6 times 7?" }],
  "max_tokens": 40,
  "temperature": 0,
  "truncate_prompt_tokens": 20,    // keep at most 20 prompt tokens (template included)…
  "truncation_side": "left"        // …by dropping tokens from the START
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{ "message": { "content": "6 times 7 is 42." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 20, "completion_tokens": 10 }   // exactly the 20 we allowed
}
```

**Request** (*chat_template override*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Say hi." }],
  "chat_template": "{% for m in messages %}{{ m['role'] | upper }}: {{ m['content'] }}\n{% endfor %}ASSISTANT:"
  // Jinja: would render "USER: Say hi.\nASSISTANT:" instead of Gemma's own markers
}
```

**Response:** HTTP 400

```json
{ "error": { "message": "Chat template is passed with request, but --trust-request-chat-template is not set. Refused request with untrusted chat template.", "type": "BadRequestError", "code": 400 } }
```

## Latency and quality

- `truncate_prompt_tokens` caps prefill time and stops over-long prompts from failing. Cutting from the left keeps
  the newest messages.
- Never put RAG context in `documents` unless you know your model's template renders it. Putting the text in a
  `user` message always works.
- If answers look strange (wrong language, continuing your text), check the template first: send the same messages
  to `/tokenize` with `return_token_strs: true` and read what the model actually sees.

## Exercise

Move the returns policy from `documents` into the user message and send again. Does the answer change?
