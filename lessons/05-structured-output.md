# Lesson 5: Structured output (JSON, choice, regex, grammar)

**Goal:** get answers your code can parse, every time.

## The idea

There are three levels of reliability:

| level | how | guarantee |
|---|---|---|
| 1. Ask | "Reply in JSON" in the prompt | none: usually works, sometimes adds ```` ```json ```` fences or chatter |
| 2. JSON mode | `response_format: {"type": "json_object"}` | valid JSON, any shape |
| 3. Schema | `response_format: {"type": "json_schema", ...}` | valid JSON with **exactly** your fields and types |

**How level 3 works:** vLLM turns your schema into rules. At every step it **blocks every token that would break
the rules** before the model picks. Right after `"order_id": `, for example, only number characters are allowed.
The model still decides the *content*, but it cannot produce an invalid *shape*.

vLLM also offers other shapes through `structured_outputs`:

| field | example | use for |
|---|---|---|
| `structured_outputs.json` | a JSON schema | same as json_schema |
| `structured_outputs.choice` | `["positive","negative","neutral"]` | classification |
| `structured_outputs.regex` | `"\\d{3}-\\d{4}"` | IDs, phone numbers, dates |
| `structured_outputs.grammar` | EBNF grammar | SQL, DSLs, code subsets |
| `disable_any_whitespace` | `true` | compact JSON (fewer tokens, so faster) |
| `continue_final_message` | a half-written `assistant` message | force how the answer starts |

## Try it (folder 5)

All requests extract data from the same email: *"Hi, I am Priya Shah. My order #4471 arrived broken on 3 Nov
2026. The screen is cracked. Please call me at 555-0142."*

| request | reference result |
|---|---|
| just ask | wrapped in ```` ```json ```` fences: your parser must strip them |
| json_object | clean JSON, but `order_id` came back as the string `"4471"` |
| json_schema, schema only | **broken**: `order_id: -4471`, then whitespace until `max_tokens` (see below) |
| json_schema + fields described in prompt | correct: `order_id: 4471`, `email: null`, clean finish |
| choice | `negative` |
| regex | `555-0142` |
| grammar (SQL) | `SELECT * FROM orders WHERE total > 100;` |
| continue_final_message | continues from `{"name": "` → `Priya Shah", "order_id": "4471"}` |

## Request and response: the schema that fails

**Request** (*json_schema, schema only*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "Email: \"Hi, I am Priya Shah. My order #4471 …\"\nExtract the fields." }],
  "max_tokens": 300,
  "temperature": 0,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "complaint",                 // any name; shows up in logs
      "strict": true,
      "schema": {                          // standard JSON Schema
        "type": "object",
        "properties": {
          "name":     { "type": "string" },
          "order_id": { "type": "integer" },
          "date":     { "type": "string" },
          "problem":  { "type": "string" },
          "phone":    { "type": ["string", "null"] },   // null allowed
          "email":    { "type": ["string", "null"] }
        },
        "required": ["name", "order_id", "date", "problem", "phone", "email"],   // every key must appear
        "additionalProperties": false                                            // and no others
      }
    }
  }
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": {
      "content": "{\n  \"name\": \"Priya Shah\",\n  \"order_id\":-4471,\n  \"date\": \"3 Nov 2026\",\n  \"problem\": \"broken screen\",\n  \"phone\": \"555-0142\"\n  \n  \n  \n  \n …"
      //                                                  ^^^^^ wrong sign            then whitespace forever ^^^
    },
    "finish_reason": "length"                                // ran out of tokens: the JSON is never closed
  }],
  "usage": { "prompt_tokens": 66, "completion_tokens": 300 } // 43 seconds of wasted generation
}
```

**What went wrong.** At each step vLLM only allows tokens that fit the schema, and the model picks its favourite
among them:
- **`-4471`**: the model wanted to write `#4471`. A `#` can't start an integer, so it took the best allowed
  token, `-`.
- **Whitespace forever:** after `"phone"` the model wanted to close the object with `}`. But `email` is required,
  so `}` was blocked. Whitespace is allowed between JSON tokens, so it wrote whitespace, and kept wanting `}`,
  until `max_tokens`.

## Request and response: the fix

Same schema. The only change is that the prompt now describes every field:

```jsonc
"messages": [{ "role": "user", "content":
  "Email: \"Hi, I am Priya Shah. My order #4471 …\"\nReturn JSON with exactly these fields: name, order_id (the number after #, as an integer), date, problem, phone, email. Use null for any field that is not in the text." }]
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": { "content": "{\"name\": \"Priya Shah\", \"order_id\": 4471, \"date\": \"3 Nov 2026\", \"problem\": \"The screen is cracked\", \"phone\": \"555-0142\", \"email\": null}" },
    "finish_reason": "stop"                                  // finished on its own
  }],
  "usage": { "prompt_tokens": 104, "completion_tokens": 59 } // 38 more prompt tokens, 241 fewer output tokens
}
```

`content` is a **string** containing JSON. Parse it: `JSON.parse(response.choices[0].message.content)`.

## The most important finding

**The schema constrains the shape; the prompt tells the model what you want.** You need both:
1. Describe every field in the prompt: its meaning, its format, and what to do when it's missing.
2. Enforce the shape with the schema.
3. Check `finish_reason` is `stop` before parsing.
4. Validate values that matter (a positive order ID, totals that add up).

**Prefilling** (*continue_final_message*) is another way to steer:

```jsonc
"add_generation_prompt": false,
"continue_final_message": true,
"messages": [
  { "role": "user", "content": "… Return JSON with name and order_id." },
  { "role": "assistant", "content": "{\"name\": \"" }        // the answer is forced to start like this
]
// response content: "Priya Shah\", \"order_id\": \"4471\"}"  ← only the continuation; join it to your prefix
```

## Latency and quality

- Enforcement itself is cheap: the rules are compiled once and cached per schema.
- `disable_any_whitespace` and short field names mean fewer output tokens, so lower latency.
- Put `"Use null if not found"` in the prompt and allow `null` in the schema. Otherwise the model must invent a value
  for a missing field.
- Constrained, predictable output also makes speculative decoding faster: drafts are accepted more often.

## Exercise

Make `order_id` safer: in *json_schema*, change it to `{"type": "integer", "minimum": 1}` and send again.
