# Lesson 13: Hosted APIs and bearer tokens (OpenAI, Google)

**Goal:** send the same requests to OpenAI, Google Vertex AI or the Gemini API, and know which fields carry over.

## The idea

vLLM speaks the **OpenAI API**. Many hosted providers offer an OpenAI-compatible endpoint too, so the same JSON
works if you change three things:

1. **Where** it goes: `api_base`
2. **Who you are**: `api_key`, sent as an HTTP header `Authorization: Bearer <api_key>`
3. **Which model**: `model`

The collection does all three with variables. Every request inherits **Bearer Token** auth from the collection
(collection → **Authorization** tab → Token `{{api_key}}`). You never paste the key into individual requests.

```
POST {{api_base}}/chat/completions
Authorization: Bearer {{api_key}}        ← added automatically from the collection's Authorization tab
Content-Type: application/json

{ "model": "{{model}}", "messages": [ … ] }
```

## Set it up in Postman

1. Import an environment from `postman/environments/`:

| environment | `api_base` | `api_key` | `model` |
|---|---|---|---|
| `openai` | `https://api.openai.com/v1` | API key from platform.openai.com (`sk-…`) | an id from *13 → list models* |
| `gcp-vertex-ai` | `https://{{gcp_region}}-aiplatform.googleapis.com/v1/projects/{{gcp_project}}/locations/{{gcp_region}}/endpoints/openapi` | `gcloud auth print-access-token` (expires after about an hour) | `google/<gemini model id>` |
| `gemini-api` | `https://generativelanguage.googleapis.com/v1beta/openai` | API key from aistudio.google.com | `<gemini model id>` |
| `local` / `gemma4-31b-baseline` | `{{server}}/v1` | empty, or the value of vLLM's `--api-key` | your served model name |

2. Select it (top-right) and replace the `PASTE-…` values. For Vertex AI, also set `gcp_project` and `gcp_region`.
3. `api_key` is a **secret** variable: Postman masks it on screen. Keep keys in environments, not in the
   collection, and don't commit filled-in environment files to git.
4. Send **13 → minimal chat**.

Vertex AI tokens expire. Get a fresh one with:

```bash
gcloud auth print-access-token        # paste the output into api_key
```

Your account (or service account) needs permission to call Vertex AI in that project, and the Vertex AI API must
be enabled.

## Errors you'll see while setting up

| status | meaning | fix |
|---|---|---|
| 401 | missing, wrong or expired key | check `api_key`; Vertex: get a new token |
| 403 | key is valid, but not allowed | Vertex: permissions or API not enabled in the project |
| 404 | wrong URL or unknown model | check `api_base` (`/v1` vs `/v1beta/openai` vs `/endpoints/openapi`) and `model` |
| 400 | a field this provider doesn't accept | remove the field or check the provider's docs |
| 429 | rate limit or quota | wait, or raise the quota |

## Request and response

**Request** (*13 → minimal chat*), to any provider:

```
POST {{api_base}}/chat/completions
Authorization: Bearer {{api_key}}
```

```json
{ "model": "{{model}}", "messages": [{ "role": "user", "content": "Say hello in 5 words." }] }
```

**Response:** the same shape as vLLM's (lesson 0): `choices[0].message.content`, `finish_reason`, `usage`. Each
provider adds its own extra fields; vLLM, for example, adds `stop_reason`. Code that reads only the standard
fields works everywhere.

## Which fields are portable

Folder 13 uses only fields from the OpenAI Chat Completions API:

| portable (OpenAI standard) | vLLM-only (folders 2–12) |
|---|---|
| `model`, `messages` (text and `image_url` parts) | `top_k`, `min_p`, `repetition_penalty`, `min_tokens` |
| `temperature`, `top_p`, `seed`, `n` | `structured_outputs` (`choice`, `regex`, `grammar`) |
| `max_completion_tokens` / `max_tokens`, `stop` | `bad_words`, `allowed_token_ids`, `stop_token_ids`, `ignore_eos` |
| `response_format` (`json_object`, `json_schema`) | `prompt_logprobs`, `return_token_ids`, `echo` |
| `stream`, `stream_options` | `chat_template`, `chat_template_kwargs`, `add_generation_prompt`, `continue_final_message` |
| `tools`, `tool_choice`, `parallel_tool_calls` | `truncate_prompt_tokens`, `priority`, `cache_salt`, `vllm_xargs` |
| `logprobs`, `top_logprobs`, `logit_bias` | `mm_processor_kwargs`, `media_io_kwargs`, `video_url` parts |
| `frequency_penalty`, `presence_penalty`, `reasoning_effort` | routes: `/health`, `/tokenize`, `/detokenize`, `/metrics` |

"Compatible" doesn't mean "identical". Each provider supports its own subset of the standard fields, and that
subset varies by model. Newer reasoning models, for example, may require `max_completion_tokens` instead of
`max_tokens`, or reject `temperature`. Unknown fields are rejected with a 400 or silently ignored, depending on the
provider. When a request fails, read the error message first, then the provider's docs.

## vLLM with an API key

vLLM can require a key too:

```bash
vllm serve <model> --api-key my-secret-key
```

Then set `api_key` to `my-secret-key`. Requests without it get a 401. (vLLM only checks keys on the OpenAI-style
routes under `/v1`.)

## Run it from the terminal

```bash
API_KEY=sk-... API_BASE=https://api.openai.com/v1 MODEL=<model-id> \
  bun scripts/run-collection.ts https://api.openai.com "13." openai
```

This writes `results/openai.md` and the payloads to `results/payloads/openai/`. Check them before committing:
**the saved payloads contain the responses but never the key**, because the key travels only in the header.

## Exercise

Send *13 → json_schema* to two different providers. Do both return valid JSON with `order_id: 4471`? Then send
*5 → structured_outputs.choice* (vLLM-only) to a hosted provider. What error comes back?
