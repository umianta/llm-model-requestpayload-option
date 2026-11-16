# Lesson 6: Tools (function calling)

**Goal:** let the model ask your code to do something, such as look up the weather or query a database.

## The idea

The model **never runs anything**. It answers with a structured request, and your code runs it.

```
round 1:  you → messages + tools list          model → "please call get_weather(city='Paris')"
          your code runs get_weather("Paris") → {"temp_c": 14, "sky": "light rain"}
round 2:  you → messages + that call + a tool message with the result    model → "It's 14 °C with light rain."
```

| field | example | effect |
|---|---|---|
| `tools` | list of functions with JSON-schema parameters | what the model may call |
| `tool_choice` | `"auto"` | the model decides |
| | `"none"` | never call a tool |
| | `"required"` | must call some tool |
| | `{"type":"function","function":{"name":"get_weather"}}` | must call this one |
| `parallel_tool_calls` | `true` | several calls in one reply |

## Server setup

Tools need flags on the server:

```bash
vllm serve ... --enable-auto-tool-choice --tool-call-parser gemma4     # parser name depends on the model
```

The reference server ran without them, so all three requests returned HTTP 400:
- *"auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set*
- *tool_choice=function "get_weather" requires --tool-call-parser to be set*

## Request and response

**Request** (*tool_choice auto*):

```jsonc
{
  "model": "gemma-4-31b",
  "temperature": 0,
  "messages": [{ "role": "user", "content": "What's the weather in Paris right now?" }],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Current weather for a city",          // the model decides from this text: make it clear
      "parameters": {                                       // JSON Schema for the arguments
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
        },
        "required": ["city"]
      }
    }
  }],
  "tool_choice": "auto",
  "parallel_tool_calls": true
}
```

**Response on a server with the tool flags** (shape per the OpenAI API):

```jsonc
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,                                      // no text: the model wants a tool instead
      "tool_calls": [{
        "id": "call_1",                                     // send this id back with the result
        "type": "function",
        "function": { "name": "get_weather", "arguments": "{\"city\": \"Paris\"}" }  // arguments is a JSON STRING
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

**Response from the reference server** (no tool flags): HTTP 400

```json
{ "error": { "message": "\"auto\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set", "type": "BadRequestError", "code": 400 } }
```

**Round 2 request** (*send tool result back*): append the call and your result, then send again.

```jsonc
"messages": [
  { "role": "user", "content": "What's the weather in Paris right now?" },
  { "role": "assistant", "content": null,
    "tool_calls": [{ "id": "call_1", "type": "function", "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" } }] },
  { "role": "tool", "tool_call_id": "call_1", "content": "{\"temp_c\": 14, \"sky\": \"light rain\"}" }   // your code's output
]
// response content: a normal answer, e.g. "It's 14 °C with light rain in Paris."
```

## Try it (folder 6)

| request | what to notice |
|---|---|
| tool_choice auto | `choices[0].message.tool_calls[0].function.arguments` = `{"city": "Paris"}`, and `finish_reason: tool_calls` |
| tool_choice forced | always a call, even if the question doesn't need one |
| send tool result back | the model turns your tool output into a normal answer |

## Latency and quality

- Tool definitions are part of the prompt, so each one adds prefill tokens. Send only the tools that are relevant.
- A good `description` for each tool and parameter is the biggest quality lever: it's all the model knows about
  the tool.
- A tool round-trip costs two model calls, plus however long your tool takes.

## Exercise

Add a second tool, `get_time(city)`, and ask "What's the weather and local time in Tokyo?" with
`parallel_tool_calls: true`. How many calls come back?
