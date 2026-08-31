import {
  useState,
} from "react";

import {
  render,
  Text,
  Box,
  useInput,
  useApp,
} from "ink";

import TextInput from "ink-text-input";
import Markdown from "@inkkit/ink-markdown";
import {
  Agent,
} from "./agent";

import {
  APPROVAL_MODE,
  MODEL,
  type ApprovalMode,
} from "./config";

import type {
  Message,
  Session,
} from "./session";

export function main(session: Session) {
  const App = () => {
    const { exit } = useApp();

    const [messages, setMessages] =
      useState<Message[]>(
        session.messages,
      );

    const [streamingContent, setStreamingContent] =
      useState("");

    const [isThinking, setIsThinking] =
      useState(false);

    const [contextUsed, setContextUsed] =
      useState(0);

    const [approvalMode, setApprovalMode] =
      useState<ApprovalMode>(APPROVAL_MODE);

    const [approval, setApproval] =
      useState<{
        command: string;
        resolve: (
          allowed: boolean,
        ) => void;
      } | null>(null);

    const [agent] = useState(
      () => new Agent(session),
    );

    useInput((input, key) => {
      if (
        key.ctrl &&
        input === "c"
      ) {
        if (isThinking || approval) {
          if (approval) {
            approval.resolve(false);
            setApproval(null);
          }

          agent.abort();
          setIsThinking(false);
          return;
        }

        exit();
        return;
      }

      if (
        key.ctrl &&
        input === "d"
      ) {
        exit();
        return;
      }
      if (approval) {
        if (input === "y") {
          approval.resolve(true);
          setApproval(null);
        }

        if (input === "n" || key.escape) {
          approval.resolve(false);
          setApproval(null);
        }

        return;
      }
      if (
        key.shift &&
        key.tab &&
        !isThinking &&
        !approval
      ) {
        agent.toggleApprovalMode();
        setApprovalMode(
          agent.approvalMode,
        );
      }
    });

    agent.setApprovalHandler(
      command =>
        new Promise(resolve => {
          setApproval({
            command,
            resolve,
          });
        }),
    );

    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        flexGrow={1}
      >
        <Header
          session={session}
        />

        <Box
          flexGrow={1}
          flexDirection="column"
          marginTop={1}
        >
          <Messages
            messages={messages}
            streamingContent={streamingContent}
          />

          {approval && (
            <ApprovalPrompt
              command={approval.command}
            />
          )}
        </Box>

        {!isThinking && !approval && (
          <Prompt
            onSubmit={async input => {
              if (
                input.startsWith("/")
              ) {
                if (input === "/clear") {
                  await agent.clear();
                  setMessages([]);
                  setContextUsed(0);
                  return;
                }

                if (
                  input === "/compact"
                ) {
                  setIsThinking(true);

                  try {
                    for await (
                      const event of agent.compact()
                    ) {
                      if (
                        event.type ===
                        "usage"
                      ) {
                        setContextUsed(
                          event.used,
                        );
                      }
                    }

                    setMessages([
                      ...agent.session
                        .messages,
                    ]);
                  } finally {
                    setIsThinking(false);
                  }

                  return;
                }

                if (
                  input ===
                  "/autocompact on"
                ) {
                  agent.autoCompact =
                    true;
                  return;
                }

                if (
                  input ===
                  "/autocompact off"
                ) {
                  agent.autoCompact =
                    false;
                  return;
                }
              }

              setIsThinking(true);
              setStreamingContent("");

              try {
                for await (
                  const event of agent.run(
                    input,
                  )
                ) {
                  if (
                    event.type ===
                    "token"
                  ) {
                    setStreamingContent(
                      content =>
                        content + event.content,
                    );
                  }

                  if (
                    event.type ===
                    "usage"
                  ) {
                    setContextUsed(
                      event.used,
                    );
                  }

                  if (
                    event.type ===
                    "compacting"
                  ) {
                    setContextUsed(
                      agent.getContextUsed(),
                    );
                  }
                }

                setMessages([
                  ...agent.session
                    .messages,
                ]);
              } catch (error) {
                setMessages(prev => [
                  ...prev,
                  {
                    role: "assistant",
                    content:
                      error instanceof
                        Error
                        ? `Error: ${error.message}`
                        : "Unknown error",
                  },
                ]);
              } finally {
                setStreamingContent("");
                setIsThinking(false);
                setApproval(null);
              }
            }}
          />
        )}

        {isThinking && !approval && (
          <Box marginTop={1}>
            <Text dimColor>
              ⠋ Working…  Ctrl+C cancel
            </Text>
          </Box>
        )}

        <StatusLine
          isThinking={isThinking}
          approvalMode={approvalMode}
          contextUsed={
            contextUsed ||
            agent.getContextUsed()
          }
          contextMax={
            agent.contextSize
          }
          session={session}
        />
      </Box>
    );
  };

  render(
    <App />,
    {
      exitOnCtrlC: false,
      incrementalRendering: true,
    },
  );
}

function Header({
  session,
}: {
  session: Session;
}) {
  return (
    <Box flexDirection="column">
      <Text bold>
        ┌─ {session.name}
      </Text>

      <Text dimColor>
        │ Model: {MODEL}
      </Text>

      <Text dimColor>
        │ cwd: {session.cwd}
      </Text>

      <Text dimColor>
        └──────────────────────────────────
      </Text>
    </Box>
  );
}

function Messages({
  messages,
  streamingContent,
}: {
  messages: Message[];
  streamingContent: string;
}) {
  return (
    <Box flexDirection="column">
      {messages.map(
        (message, index) => {
          if (
            message.role ===
            "system"
          ) {
            return null;
          }

          if (
            message.role ===
            "tool"
          ) {
            return null;
          }

          if (
            message.role ===
            "user"
          ) {
            return (
              <Box
                key={`${message.role}-${index}`}
                marginTop={1}
              >
                <Text bold>
                  {"› "}
                </Text>
                <Text>
                  {message.content}
                </Text>
              </Box>
            );
          }

          if (
            !message.content
          ) {
            return null;
          }

          return (
            <Box
              key={`${message.role}-${index}`}
              marginTop={1}
              paddingLeft={2}
            >
              <Text bold>
                {"◆ "}
              </Text>

              <Markdown>
                {message.content}
              </Markdown>
            </Box>
          );
        },
      )}

      {streamingContent && (
        <AssistantMessage content={streamingContent} />
      )}
    </Box>
  );
}

function AssistantMessage({
  content,
}: {
  content: string;
}) {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text bold>{"◆ "}</Text>
      <Markdown>{content}</Markdown>
    </Box>
  );
}

function ApprovalPrompt({
  command,
}: {
  command: string;
}) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={2}
    >
      <Text bold>
        ⚠ Command requires approval
      </Text>

      <Text>
        $ {command}
      </Text>

      <Text dimColor>
        y approve · n reject · Ctrl+C cancel
      </Text>
    </Box>
  );
}

function Prompt({
  onSubmit,
}: {
  onSubmit: (
    value: string,
  ) => Promise<void>;
}) {
  const [value, setValue] =
    useState("");

  return (
    <Box marginTop={1}>
      <Text bold>{"› "}</Text>

      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={async input => {
          setValue("");
          await onSubmit(input);
        }}
      />
    </Box>
  );
}

function StatusLine({
  isThinking,
  approvalMode,
  contextUsed,
  contextMax,
  session,
}: {
  isThinking: boolean;
  approvalMode: ApprovalMode;
  contextUsed: number;
  contextMax: number;
  session: Session;
}) {
  return (
    <Box
      marginTop={1}
      justifyContent="space-between"
    >
      <Text dimColor>
        {isThinking
          ? "Thinking"
          : "Idle"}
        {" · "}
        {approvalMode === "auto"
          ? "Auto-approve"
          : "Manual-approve"}
      </Text>

      <Text dimColor>
        {contextUsed.toLocaleString()}
        /
        {contextMax.toLocaleString()}
        {" · "}
        Shift+Tab approval
        {" · "}
        Ctrl+C/D stop/exit
        {" · "}
        {session.name}

      </Text>
    </Box>
  );
}
