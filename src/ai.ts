import { URL, MODEL } from "./config";
import type { Message, ToolCall } from "./session";

export const tools = [
  {
    type: "function",
    function: {
      name: "shell",
      description:
        "Execute a shell command in the current working directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute.",
          },
        },
        required: ["command"],
      },
    },
  },
];

export type AIEvent =
  | {
    type: "token";
    content: string;
  }
  | {
    type: "tool_calls";
    tool_calls: ToolCall[];
  }
  | {
    type: "usage";
    promptTokens: number;
    totalTokens: number;
  };

type Chunk = {
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
};

export async function* ask(
  messages: Message[],
  signal?: AbortSignal,
): AsyncGenerator<AIEvent> {
  const response = await fetch(
    `${URL}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `AI request failed: ${response.status} ${await response.text()}`,
    );
  }

  if (!response.body) {
    throw new Error("AI response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  const toolCalls = new Map<number, ToolCall>();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line.startsWith("data: ")) {
        continue;
      }

      const data = line.slice(6).trim();

      if (data === "[DONE]") {
        if (toolCalls.size > 0) {
          yield {
            type: "tool_calls",
            tool_calls: [...toolCalls.values()],
          };
        }

        return;
      }

      let chunk: Chunk;

      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }

      if (chunk.usage) {
        yield {
          type: "usage",
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        };
      }

      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        yield {
          type: "token",
          content: delta.content,
        };
      }

      if (delta?.tool_calls) {
        for (const deltaCall of delta.tool_calls) {
          const index = deltaCall.index ?? 0;

          let call = toolCalls.get(index);

          if (!call) {
            call = {
              id: deltaCall.id ?? "",
              type: "function",
              function: {
                name: "",
                arguments: "",
              },
            };
            toolCalls.set(index, call);
          }

          if (deltaCall.id) {
            call.id = deltaCall.id;
          }

          if (deltaCall.function?.name) {
            call.function.name +=
              deltaCall.function.name;
          }

          if (deltaCall.function?.arguments) {
            call.function.arguments +=
              deltaCall.function.arguments;
          }
        }
      }
    }
  }

  if (toolCalls.size > 0) {
    yield {
      type: "tool_calls",
      tool_calls: [...toolCalls.values()],
    };
  }
}
