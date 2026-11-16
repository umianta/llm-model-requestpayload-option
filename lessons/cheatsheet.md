# Cheat sheet: which field for which goal

## By goal

| I want… | use | lesson |
|---|---|---|
| the same answer every time | `temperature: 0` (or a `seed` with sampling) | 2 |
| creative variety | `temperature: 0.7–1.0`, `top_p: 0.9` | 2 |
| several options at once | `n: 3` | 2 |
| a hard length limit | `max_tokens` (check `finish_reason`) | 3 |
| to stop at a marker | `stop`, `stop_token_ids` | 3 |
| less repetition | `frequency_penalty` / `repetition_penalty` (keep it small) | 4 |
| a one-word classifier | `structured_outputs.choice` or `allowed_token_ids` | 4, 5 |
| JSON my code can parse | `response_format: json_schema` + enough `max_tokens` | 5 |
| a specific pattern (ID, phone, date) | `structured_outputs.regex` | 5 |
| SQL or another small language | `structured_outputs.grammar` | 5 |
| to force how the answer starts | `continue_final_message` + a partial `assistant` message | 5 |
| the model to call my functions | `tools` + `tool_choice` (server flags needed) | 6 |
| better maths / logic | `reasoning_effort` (much slower) | 7 |
| text on screen quickly | `stream: true` | 8 |
| how sure the model was | `logprobs`, `top_logprobs` | 9 |
| to grade existing text with the model | `prompt_logprobs` | 9 |
| to protect against over-long prompts | `truncate_prompt_tokens` + `truncation_side: left` | 10 |
| to count tokens / find token IDs | `POST /tokenize` | 11 |
| to read an image | `image_url` content part | 12 |
| to read a PDF | `pdftotext` → text, or `pdftoppm` → page images | 12 |
| to understand a video | `video_url` + `media_io_kwargs.video.num_frames` | 12 |

## Latency vs quality

| lever | faster ⟵ | ⟶ better quality | what it costs |
|---|---|---|---|
| `max_tokens` | small | big enough to finish | cut-off answers / broken JSON if too small |
| `temperature` | 0 | 0 for facts, 0.7+ for creativity | nothing |
| thinking (`reasoning_effort`) | off | on for multi-step problems | 5–20x more output tokens |
| `n` / beam search | 1, no beam | `n` for options; beam rarely helps chat models | beam: ~10x slower |
| JSON whitespace | `disable_any_whitespace` | same | nothing |
| prompt length | short, stable prefix (prefix cache) | include what the model needs | TTFT grows with prompt length |
| image detail (Gemma-4 `max_soft_tokens`) | 70 | 560–1120 for small text / OCR | TTFT grows with vision tokens |
| video frames (`num_frames`) | 4–8 | 16–32 | ~78 tokens per frame |
| PDF | text layer (`pdftotext`) or page image at 70–280 | 560–1120 for small print / scans, or text + image | measured: invoice page = 341 tokens at 280 vs 435 for `-layout` text; 1,167 at 1120 |
| media transport | base64, resized | same | a 2,560 px photo by URL: 857 ms TTFT vs 186 ms inline |

## Fields that need server flags

| field | flag |
|---|---|
| `tools`, `tool_choice` | `--enable-auto-tool-choice --tool-call-parser <name>` |
| separate `reasoning_content` | `--reasoning-parser <name>` |
| `chat_template` in a request | `--trust-request-chat-template` |
| `priority` | `--scheduling-policy priority` |
| several images per prompt | `--limit-mm-per-prompt` |
| `min_p`, `logit_bias` | a server **without** `--speculative-config` (vLLM 0.28 rejects them with speculative decoding) |
