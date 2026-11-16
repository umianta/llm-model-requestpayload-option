# Lesson 12: Images, video and PDFs (latency vs quality)

**Goal:** send images, video and documents, and choose the settings that balance speed and accuracy.

## The idea

`content` can be a **list of parts** instead of a string. vLLM turns each image (or video frame) into **vision
tokens** that sit in the prompt next to your text tokens. That gives one simple rule:

> More vision tokens → more detail the model can see → longer prefill (TTFT) and more memory.

The output side doesn't change: every answer token still takes the same time to write.

| part | shape |
|---|---|
| text | `{"type": "text", "text": "…"}` |
| image by URL | `{"type": "image_url", "image_url": {"url": "https://…/photo.jpg"}}` |
| image inline | `{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ…"}}` |
| video | `{"type": "video_url", "video_url": {"url": "https://…/clip.mp4"}}` |
| PDF | **not supported directly**: convert it (see below) |

| setting | field | Gemma-4 values |
|---|---|---|
| image detail | `mm_processor_kwargs: {"max_soft_tokens": N}` | 70, 140, **280** (default), 560, 1120 |
| video frames | `media_io_kwargs: {"video": {"num_frames": N}}` | up to 32; ~78 tokens per frame |

Other models use other knobs (e.g. Qwen-VL: `min_pixels` / `max_pixels`). The idea is the same: fewer pixels
means fewer tokens.

## Request and response: an image

**Request** (*image URL (default detail 280)*):

```jsonc
{
  "model": "gemma-4-31b",
  "temperature": 0,
  "max_tokens": 200,
  "messages": [{
    "role": "user",
    "content": [                                            // a LIST of parts instead of a string
      { "type": "image_url",
        "image_url": { "url": "https://vllm-public-assets.s3.us-west-2.amazonaws.com/vision_model_images/stop_sign.jpg" } },
      { "type": "text", "text": "What does the sign say, and what is behind it?" }   // image first, question last
    ]
  }]
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{
    "message": { "content": "The sign says \"STOP\" and behind it is a large, red traditional Chinese gate (paifang) leading into a Chinatown district." },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 287,       // ≈ 280 vision tokens + ~7 tokens of text and markers: the image dominates
    "completion_tokens": 29
  }
}
```

## Request and response: a video

**Request** (*video 8 frames*):

```jsonc
{
  "model": "gemma-4-31b",
  "temperature": 0,
  "max_tokens": 200,
  "messages": [{ "role": "user", "content": [
    { "type": "video_url", "video_url": { "url": "https://huggingface.co/datasets/raushan-testing-hf/videos-test/resolve/main/sample_demo_1.mp4" } },
    { "type": "text", "text": "What happens in this video? 3 bullet points." }
  ]}],
  "media_io_kwargs": { "video": { "num_frames": 8 } }      // sample 8 evenly spaced frames
}
```

**Response** (trimmed):

```jsonc
{
  "choices": [{ "message": { "content": "* A young toddler wearing glasses is sitting on a bed holding a book.\n* The child attempts to read and flip through the pages…" } }],
  "usage": { "prompt_tokens": 623, "completion_tokens": 64 }   // 8 frames ≈ 8 × 78 tokens
}
```

## Request and response: a PDF page as an image

vLLM accepts no PDF input, so convert the PDF on your side. There are two ways:

```bash
pdftotext -layout invoice.pdf -                                      # 1. the text layer (exact characters)
pdftoppm -f 1 -l 1 -scale-to 1100 -jpeg -singlefile invoice.pdf page  # 2. page 1 → page.jpg (layout, tables, scans)
base64 -w0 page.jpg                                                  #    → paste after data:image/jpeg;base64,
```

The sample is [`samples/invoice.pdf`](../samples/invoice.pdf), a fictional invoice with a 4-line table, VAT and a
total.

**Request** (*PDF page as image, detail 280*): image plus schema, the typical document-extraction setup.

```jsonc
{
  "model": "gemma-4-31b",
  "temperature": 0,
  "max_tokens": 400,
  "messages": [{ "role": "user", "content": [
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<72 KB of base64>" } },
    { "type": "text", "text": "Extract the invoice as JSON with: invoice_number, invoice_date, customer_name, po_number, line_items (description, qty, unit_price, amount), subtotal, vat, total. Amounts as plain numbers without currency symbols. Use null if a field is missing." }
  ]}],
  "response_format": { "type": "json_schema", "json_schema": { "name": "invoice", "schema": { … } } },   // full schema in the collection
  "mm_processor_kwargs": { "max_soft_tokens": 280 }      // image detail
}
```

**Response:** `choices[0].message.content`, parsed:

```json
{
  "invoice_number": "INV-2026-0419",
  "invoice_date": "03 Nov 2026",
  "customer_name": "Priya Shah",
  "po_number": "PO-77812",
  "line_items": [
    { "description": "GPU cooling plate, copper",     "qty": 4,  "unit_price": 89.00, "amount": 356.00 },
    { "description": "Thermal paste, 10 g",           "qty": 10, "unit_price": 7.50,  "amount": 75.00 },
    { "description": "PCIe riser cable, 30 cm",       "qty": 2,  "unit_price": 24.90, "amount": 49.80 },
    { "description": "Rack shelf, 1U (discontinued)", "qty": 1,  "unit_price": 61.20, "amount": 61.20 }
  ],
  "subtotal": 542.00, "vat": 102.98, "total": 644.98
}
```

`usage`: 341 prompt tokens, 260 completion tokens.

## Measured: latency vs quality

Reference server: Gemma-4-31B FP8 on one NVIDIA GB10, vLLM 0.28. TTFT is the median of 3 cold runs
(`results/gemma4-31b-multimodal-ttft.json`).

| request | prompt tokens | TTFT (median) | quality on this sample |
|---|---|---|---|
| image base64, 1×1 pixel | 280 | 229 ms | "Red" ✓ |
| image URL, detail 280 (stop sign) | 287 | 458 ms | correct text, gate, setting |
| image URL, detail 70 (2560 px photo) | 88 | 857 ms | good scene description |
| image URL, detail 1120 (same photo) | 1,135 | 1,000 ms | adds finer detail (light, path curve) |
| two images | 557 | 684 ms | correct comparison |
| video, 8 frames | 623 | 568 ms | correct 3-point summary |
| video, 32 frames | 2,423 | 2,102 ms | same summary, slightly more precise |
| PDF as text (`pdftotext -layout`) | 435 | 269 ms | **every field correct** |
| PDF page image, detail 70 | 138 | 186 ms | **all amounts correct**, date reformatted ("Nov 03 2026") |
| PDF page image, detail 280 | 341 | 245 ms | all correct |
| PDF page image, detail 1120 | 1,167 | 1,443 ms | all correct |
| PDF text + image (560) | 973 | 1,239 ms | all correct |

What the numbers say:

1. **TTFT grows with vision tokens.** For the same invoice: 70 → 186 ms, 280 → 245 ms, 1120 → 1,443 ms. For
   video: 8 frames → 0.6 s, 32 frames → 2.1 s.
2. **Downloading costs more than detail.** At the same detail 70, the 2,560-pixel photo sent by URL took 857 ms,
   4.6x the 186 ms of the invoice sent inline, because the server first had to download and decode a large JPEG.
   **Send base64, and resize images before sending.**
3. **On a clean, printed page even detail 70 read every number.** Quality differences show up with *small print,
   dense tables, handwriting and scans*. Test your own documents at 280, then go up only if values are misread.
4. **The page image was cheaper than the text layer here** (341 vs 435 tokens at 280): `-layout` pads the text with
   spaces to keep columns. Without `-layout` the text is shorter, but columns get mixed up.
5. **Output dominates total time.** Every PDF request took ~38 s in total, because writing 260 tokens of JSON at
   ~7 tokens/s takes ~37 s. Going from 280 to 1120 added ~1.2 s. To cut latency, shorten the *output* first:
   fewer fields, no whitespace (`disable_any_whitespace`), and short key names.

## Rules of thumb

| situation | start with |
|---|---|
| "What's in this photo?" | detail 280, base64, image before the question |
| reading small text, receipts, screenshots | detail 560–1120 |
| born-digital PDF (has a text layer) | `pdftotext`; add the page image only if layout matters |
| scanned PDF (no text layer) | page images at 560–1120, one image per page |
| video summary | 8 frames; go to 16–32 for fast action or counting |
| important extraction (invoices, contracts) | text + page image + schema, then validate (e.g. line items sum to subtotal) |

## Gotchas

- **`--max-model-len`** limits prompt + output together. 32 frames ≈ 2.5k tokens; 4 pages at 1120 ≈ 4.5k tokens.
- Several images per prompt may need `--limit-mm-per-prompt '{"image": 4}'` on the server.
- With a URL, the **server** downloads the file, so the server needs internet access. If it has none, use base64.
- Vision tokens use KV-cache memory like text, so large images reduce how many requests fit at once.

## Exercise

1. Take a photo of a receipt with small print and send it at detail 70, 280 and 1120. At which detail does every
   price come out right?
2. Validate the invoice JSON in code: do the line `amount`s add up to `subtotal`, and is `subtotal + vat = total`?
