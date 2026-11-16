# Lesson 9: Probabilities and token IDs

**Goal:** see how confident the model was, and grade any text with the model.

## The idea

A **logprob** is the log of a probability. As a rough guide:

| logprob | probability |
|---|---|
| −0.02 | 98% |
| −0.7 | 50% |
| −2.3 | 10% |
| −4.6 | 1% |

| field | example | effect |
|---|---|---|
| `logprobs` | `true` | confidence for every token the model **wrote** |
| `top_logprobs` | `5` | also show the 5 runner-up tokens at each step |
| `prompt_logprobs` | `1` | confidence for every token **you sent**, plus the model's own #1 pick at each position |
| `return_tokens_as_token_ids` | `true` | tokens shown as `token_id:1234` instead of text |
| `return_token_ids` | `true` | the raw prompt and output token ID lists |
| `echo` | `true` | the prompt repeated in front of the answer |

## Try it (folder 9)

| request | what to notice |
|---|---|
| logprobs + top_logprobs 5 | "Paris" with logprob near 0 (very sure); the runners-up are far below |
| prompt_logprobs 1 | the prompt is "The capital of France is **Lyon**": find the ` Lyon` position and its rank |
| return_tokens_as_token_ids | the same tokens as numbers |

## Request and response: `logprobs`

**Request** (*logprobs + top_logprobs 5*):

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "The capital of France is" }],
  "max_tokens": 10,
  "temperature": 0,
  "logprobs": true,      // confidence of each written token
  "top_logprobs": 5      // plus the 5 best alternatives at each step
}
```

**Response** (trimmed, numbers rounded):

```jsonc
{
  "choices": [{
    "message": { "content": "Paris" },
    "logprobs": {
      "content": [                                         // one entry per WRITTEN token
        {
          "token": "Paris", "logprob": -0.00003,          // ≈ 99.997% sure
          "bytes": [80, 97, 114, 105, 115],               // UTF-8 bytes (useful for emoji / partial characters)
          "top_logprobs": [                               // the 5 candidates the model considered
            { "token": "Paris",  "logprob": -0.00003 },
            { "token": " Paris", "logprob": -11.19 },     // same word with a leading space: a different token
            { "token": "**",     "logprob": -11.44 },     // start of bold markdown
            { "token": "The",    "logprob": -12.00 },
            { "token": "the",    "logprob": -13.31 }
          ]
        },
        {
          "token": "<turn|>", "logprob": -0.08,           // end-of-turn: the model is done
          "top_logprobs": [ { "token": "<turn|>", "logprob": -0.08 }, { "token": ".", "logprob": -2.58 }, … ]
          //                                                          ^ ~8% chance it would have added a full stop
        }
      ]
    },
    "finish_reason": "stop"
  }]
}
```

## Request and response: `prompt_logprobs`

**Request** (*prompt_logprobs 1*): a false statement as the prompt.

```jsonc
{
  "model": "gemma-4-31b",
  "messages": [{ "role": "user", "content": "The capital of France is Lyon" }],
  "max_tokens": 1,
  "temperature": 0,
  "prompt_logprobs": 1      // grade every PROMPT token; also show the model's #1 pick at each position
}
// note: prompt_logprobs does not work together with "stream": true
```

**Response** (trimmed): `prompt_logprobs` is a list with **one entry per prompt token**, chat-template tokens
included. Each entry is keyed by token ID and holds the token that was actually there, plus the model's #1 choice
if that was a different token.

```jsonc
{
  "choices": [{ "message": { "content": "Actually" }, "finish_reason": "length" }],  // its 1 token: about to correct you!
  "prompt_logprobs": [
    null,                                                                  // first token: nothing before it to judge by
    …
    {                                                                      // position of " France"
      "7001": { "decoded_token": " France", "logprob": -12.81, "rank": 6970 },   // what was there
      "912":  { "decoded_token": " part",   "logprob": -1.25,  "rank": 1 }       // what the model expected
    },
    …
    {                                                                      // position of " Lyon"
      "49533": { "decoded_token": " Lyon", "logprob": -16.06, "rank": 30633 },   // ≈ 1 in 9 million
      "506":   { "decoded_token": " the",  "logprob": -0.64,  "rank": 1 }        // expected "…is the …"
    },
    …
  ]
}
```

How to read it:
- **`rank: 1`** means this token was the model's top choice. Large ranks mean "surprising here".
- ` Lyon` ranks 30,633rd, so the model strongly disagrees with it. The model's favourite was ` the`
  (as in "is the city of…"), not ` Paris`: grading shows how surprised the model was, not what the right answer is.
- The model is predicting text in the **user's** turn here, which it was never trained to write, so early user
  tokens get poor ranks too (` France` = 6,970). Compare ranks *within* the same kind of text.
- The one token the model was allowed to write was **"Actually"**: it was about to correct the statement.

## `prompt_logprobs` in one sentence

"Here is some text. At each position, how likely did *you* think the token was, and what would *you* have picked?"

The model doesn't write anything new: it's one prefill pass over text that already exists. That makes it a cheap
tool for:
- checking whether an answer is what the model itself would have said, token by token
- spotting surprising, low-probability spans in a document
- scoring several candidate answers by their total logprob

## Latency and quality

- `logprobs` / `top_logprobs` add little cost.
- `prompt_logprobs` adds work proportional to the prompt length.
- Low confidence on a key token (a number or a name) is a useful signal to send that answer for review.

## Exercise

Change the *prompt_logprobs* prompt to "The capital of France is Paris". What is the rank of ` Paris` now?
