import { spawn } from "node:child_process";

import { ask } from "./ai";
import type {
  Message,
  Session,
  ToolCall,
} from "./session";
import { saveSession } from "./session";
import {
  APPROVAL_MODE,
  CONTEXT_SIZE,
  type ApprovalMode,
} from "./config";

export type AgentEvent =
  | { type: "token"; content: string }
  | { type: "tool"; command: string }
  | { type: "usage"; used: number; max: number }
  | { type: "compacting" };

const MAX_TOOL_OUTPUT = 20_000;

export class Agent {
  session: Session;

  approvalMode: ApprovalMode = APPROVAL_MODE;

  contextSize = CONTEXT_SIZE;
  contextUsed = 0;

  autoCompact = true;
  compactThreshold = 0.8;

  approvalHandler:
    | ((command: string) => Promise<boolean>)
    | undefined;

  private requestController?: AbortController;
  private currentProcess?: ReturnType<typeof spawn>;
  private aborted = false;

  constructor(session: Session) {
    this.session = session;
  }

  toggleApprovalMode() {
    this.approvalMode =
      this.approvalMode === "manual"
        ? "auto"
        : "manual";
  }

  setApprovalHandler(
    handler: (command: string) => Promise<boolean>,
  ) {
    this.approvalHandler = handler;
  }

  abort() {
    this.aborted = true;

    this.requestController?.abort();

    if (this.currentProcess?.pid) {
      try {
        process.kill(
          -this.currentProcess.pid,
          "SIGINT",
        );
      } catch {
        this.currentProcess.kill("SIGINT");
      }
    }
  }

  async clear() {
    this.session.messages = [];
    this.session.summary = undefined;
    this.contextUsed = 0;

    await saveSession(this.session);
  }

  estimateContext() {
    const text = this.session.messages
      .map(message => message.content)
      .join("");

    return Math.ceil(text.length / 4);
  }

  getContextUsed() {
    return this.contextUsed || this.estimateContext();
  }

  needsCompaction() {
    return (
      this.getContextUsed() >=
      this.contextSize * this.compactThreshold
    );
  }

  private getMessages(): Message[] {
    const messages: Message[] = [
      {
        role: "system",
        content: [
          "You are a coding agent.",
          `Current working directory: ${this.session.cwd}`,
          "Use tools when you need information from the environment.",
          "Do not guess information that can be obtained with a tool.",
        ].join("\n"),
      },
    ];

    if (this.session.summary) {
      messages.push({
        role: "system",
        content: `Previous context summary:\n\n${this.session.summary}`,
      });
    }

    messages.push(...this.session.messages);

    return messages;
  }

  async *compact(): AsyncGenerator<AgentEvent> {
    if (!this.session.messages.length) {
      return;
    }

    yield { type: "compacting" };

    const conversation =
      this.session.messages
        .map(
          message =>
            `${message.role}: ${message.content}`,
        )
        .join("\n");

    let summary = "";

    for await (const event of ask([
      {
        role: "user",
        content: `Summarize this agent session.

Keep important:
- goals
- decisions
- technical facts
- file paths
- unfinished tasks
- constraints
- useful command results

Do not invent anything.

Conversation:

${conversation}`,
      },
    ])) {
      if (event.type === "token") {
        summary += event.content;
      }
    }

    this.session.summary = summary;
    this.session.messages =
      this.session.messages.slice(-10);

    await saveSession(this.session);

    this.contextUsed = this.estimateContext();

    yield {
      type: "usage",
      used: this.contextUsed,
      max: this.contextSize,
    };
  }

  async *run(
    prompt: string,
  ): AsyncGenerator<AgentEvent> {
    this.aborted = false;

    if (
      this.autoCompact &&
      this.needsCompaction()
    ) {
      yield* this.compact();
    }

    this.session.messages.push({
      role: "user",
      content: prompt,
    });

    await saveSession(this.session);

    while (!this.aborted) {
      let assistantContent = "";
      let toolCalls: ToolCall[] = [];

      this.requestController =
        new AbortController();

      try {
        for await (
          const event of ask(
            this.getMessages(),
            this.requestController.signal,
          )
        ) {
          if (event.type === "token") {
            assistantContent += event.content;

            yield {
              type: "token",
              content: event.content,
            };
          }

          if (event.type === "tool_calls") {
            toolCalls = event.tool_calls;
          }

          if (event.type === "usage") {
            this.contextUsed =
              event.promptTokens;

            yield {
              type: "usage",
              used: event.promptTokens,
              max: this.contextSize,
            };
          }
        }
      } catch (error) {
        if (this.aborted) {
          return;
        }

        throw error;
      } finally {
        this.requestController = undefined;
      }

      if (
        assistantContent ||
        toolCalls.length
      ) {
        this.session.messages.push({
          role: "assistant",
          content: assistantContent,
          ...(toolCalls.length
            ? { tool_calls: toolCalls }
            : {}),
        });
      }

      if (!toolCalls.length) {
        await saveSession(this.session);
        return;
      }

      for (const toolCall of toolCalls) {
        if (this.aborted) {
          return;
        }

        if (
          toolCall.function.name !== "shell"
        ) {
          this.session.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              `Unknown tool: ${toolCall.function.name}`,
          });

          continue;
        }

        let args: { command: string };

        try {
          args = JSON.parse(
            toolCall.function.arguments,
          );
        } catch {
          this.session.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Invalid shell arguments.",
          });

          continue;
        }

        const command = args.command;

        yield {
          type: "tool",
          command,
        };

        let allowed =
          this.approvalMode === "auto";

        if (
          !allowed &&
          this.approvalHandler
        ) {
          allowed =
            await this.approvalHandler(
              command,
            );
        }

        if (!allowed) {
          this.session.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              "Command execution denied by user.",
          });

          continue;
        }

        const output =
          await this.executeShell(command);

        this.session.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: output,
        });

        await saveSession(this.session);
      }
    }
  }

  private executeShell(
    command: string,
  ): Promise<string> {
    return new Promise(resolve => {
      const child = spawn(
        "/bin/sh",
        ["-c", command],
        {
          cwd: this.session.cwd,
          detached: true,
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        },
      );

      this.currentProcess = child;

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", data => {
        stdout += data.toString();
      });

      child.stderr?.on("data", data => {
        stderr += data.toString();
      });

      child.on("close", (code, signal) => {
        this.currentProcess =
          undefined;

        if (this.aborted) {
          resolve(
            "[Command cancelled by user]",
          );
          return;
        }

        let output = [
          stdout,
          stderr,
        ]
          .filter(Boolean)
          .join("\n");

        if (!output) {
          output = `(exit ${code ?? "?"}${signal ? `, ${signal}` : ""
            })`;
        }

        if (
          output.length >
          MAX_TOOL_OUTPUT
        ) {
          output =
            output.slice(
              0,
              MAX_TOOL_OUTPUT,
            ) +
            "\n\n[output truncated]";
        }

        resolve(output);
      });
    });
  }
}
