# LLM request payload options: a hands-on Postman tutorial

Learn every field you can send to an LLM model through an OpenAI-compatible API: what it does, when to use it, and
what it costs. You learn by sending real requests and comparing the answers.

It works with any server that speaks the OpenAI Chat Completions API: a self-hosted model (vLLM, SGLang, Ollama and
others) or a hosted one (OpenAI, Google Vertex AI, Gemini API). The standard fields work everywhere; lessons that use
server-specific extras, such as vLLM's `structured_outputs` or `/tokenize`, say so.

There are 14 lessons, from your first request to images, video, PDFs and hosted APIs (OpenAI, Google). Each lesson has a folder of ready-made
requests in the Postman collection and a short page in [`lessons/`](lessons/) that explains what to look for.
[`results/`](results/) has the real outputs and timings from a reference server,
so you can compare them with your own. Every lesson shows a real request and response, with the key fields explained.

## Who this is for

You can run `curl` and you've heard of LLMs. You don't need any prior knowledge of how models generate text:
lesson 0 explains it from scratch.

## Repository layout

```
.
├── README.md                    you are here
├── lessons/                     one page per lesson (read alongside the collection)
├── postman/
│   ├── llm-model-requestpayload-options.postman_collection.json   85 requests in 14 folders
│   └── environments/            presets: local server, reference server, OpenAI, Vertex AI, Gemini API
├── samples/                     sample invoice used in the PDF lesson (HTML source, PDF, text, page image)
├── scripts/
│   ├── build-collection.ts      source of truth: generates the collection JSON
│   └── run-collection.ts        sends every request, records TTFT / tokens / output
└── results/                     reference run: summary table + full request/response payload per request
```

## Quick start

**1. Have an LLM endpoint.** Either a hosted API (skip to step 2 and see [lesson 13](lessons/13-hosted-apis.md) for
keys), or a model you run yourself, for example with vLLM:

```bash
vllm serve <huggingface-model-id> --served-model-name my-model --max-model-len 4096
```

Then set the Postman variable `model` to the served name (`my-model` here).

A few lessons need extra server flags. See [lesson 0](lessons/00-setup.md#server-flags).

**2. Import into Postman:** *Import* → choose `postman/llm-model-requestpayload-options.postman_collection.json` and the files in
`postman/environments/`. Pick an environment in the top-right, or edit the collection variables `server`, `api_base`,
`model` and `api_key`.

**3. Send requests:** start with folder *0. Server info → health*. After each request, look at:
- **Body**: the model's answer.
- **Test Results**: `finish_reason`, tokens in/out, and speed.
- **Console** (bottom bar): the answer text on its own.

**No Postman?** Run the whole collection from the terminal with [Bun](https://bun.sh):

```bash
bun scripts/run-collection.ts http://localhost:8000              # all lessons
bun scripts/run-collection.ts http://localhost:8000 "12." mine   # just lesson 12, saved as results/mine.md
                                                                 # + every payload in results/payloads/mine/
```

## Lessons

| # | lesson | you will learn |
|---|---|---|
| 0 | [Setup and how a request works](lessons/00-setup.md) | the request's path from JSON to tokens to GPU and back; server flags |
| 1 | [Messages](lessons/01-messages.md) | roles, system prompts, conversation memory |
| 2 | [Randomness](lessons/02-sampling.md) | temperature, top_p, top_k, min_p, seed, n, beam search |
| 3 | [Length and stopping](lessons/03-length-stopping.md) | max_tokens, min_tokens, stop, stop_token_ids, ignore_eos |
| 4 | [Repetition and banned words](lessons/04-repetition-banned.md) | penalties, bad_words, logit_bias, allowed_token_ids |
| 5 | [Structured output (JSON)](lessons/05-structured-output.md) | json_object, json_schema, choice, regex, grammar, prefilling |
| 6 | [Tools](lessons/06-tools.md) | function calling, the two-round flow |
| 7 | [Thinking models](lessons/07-reasoning.md) | reasoning_effort, hiding the reasoning |
| 8 | [Streaming](lessons/08-streaming.md) | server-sent events, usage in streams, TTFT |
| 9 | [Probabilities and token IDs](lessons/09-logprobs.md) | logprobs, top_logprobs, **prompt_logprobs** |
| 10 | [Prompt and template control](lessons/10-templates.md) | chat templates, truncation, special tokens |
| 11 | [Server and tokenizer](lessons/11-server-tokenizer.md) | request IDs, priority, cache_salt, /tokenize, /v1/completions |
| 12 | [Images, video and PDFs](lessons/12-multimodal.md) | latency vs quality: detail level, frame count, text vs page image |
| 13 | [Hosted APIs and bearer tokens](lessons/13-hosted-apis.md) | API keys, OpenAI, Google Vertex AI, Gemini API; which fields are portable |

Short on time? Read [the cheat sheet](lessons/cheatsheet.md): which field to use for which goal, and how each one
affects latency and quality.

## Changing the collection

Edit `scripts/build-collection.ts`, then regenerate the collection:

```bash
bun scripts/build-collection.ts postman/llm-model-requestpayload-options.postman_collection.json samples
```

Edits made inside Postman are lost when the collection is regenerated, so put lasting changes in the script.

## Version notes

The standard fields follow the OpenAI Chat Completions API. The server-specific extras were checked against the
vLLM source and tested on **vLLM 0.28**. Older or newer versions may add,
rename or reject a field. The server answers with HTTP 400 and a message that names the problem.
