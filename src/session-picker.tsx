import { useState } from "react";
import TextInput from "ink-text-input";
import type { Session } from "./session";
import { render, Text, Box, useInput } from "ink";
import { saveSession } from "./session";

export function pickSession(
  sessions: Session[],
): Promise<Session | null> {
  return new Promise(resolve => {
    let instance:
      ReturnType<typeof render>;

    const Picker = () => {
      const [selected, setSelected] =
        useState(0);

      const [renaming, setRenaming] =
        useState(false);

      const [
        name,
        setName,
      ] = useState(
        sessions[0]?.name ??
        "",
      );

      useInput(
        (input, key) => {
          if (renaming) {
            if (key.escape) {
              setRenaming(false);
            }

            return;
          }

          if (input === "r") {
            setName(
              sessions[selected]
                .name,
            );
            setRenaming(true);
            return;
          }

          if (key.upArrow) {
            setSelected(index =>
              index > 0
                ? index - 1
                : sessions.length - 1,
            );
          }

          if (key.downArrow) {
            setSelected(index =>
              index <
                sessions.length - 1
                ? index + 1
                : 0,
            );
          }

          if (key.return) {
            resolve(
              sessions[selected],
            );

            instance.unmount();
          }

          if (key.escape) {
            resolve(null);
            instance.unmount();
          }
        },
        {
          isActive: !renaming,
        },
      );

      return (
        <Box
          flexDirection="column"
          padding={1}
          borderStyle="round"
        >
          <Text bold>
            Resume session
          </Text>

          <Text> </Text>

          {sessions.map(
            (session, index) => (
              <Box
                key={session.id}
              >
                <Text
                  bold={
                    index ===
                    selected
                  }
                >
                  {index ===
                    selected
                    ? "› "
                    : "  "}
                  {session.name}
                </Text>

                <Text dimColor>
                  {"  "}
                  {session.cwd}
                </Text>
              </Box>
            ),
          )}

          <Text> </Text>

          {renaming ? (
            <Box>
              <Text>
                Rename:{" "}
              </Text>

              <TextInput
                value={name}
                onChange={
                  setName
                }
                onSubmit={async value => {
                  const renamed =
                    value.trim() ||
                    "Unnamed session";

                  sessions[
                    selected
                  ].name = renamed;

                  await saveSession(
                    sessions[
                    selected
                    ],
                  );

                  setRenaming(
                    false,
                  );
                }}
              />
            </Box>
          ) : (
            <Text dimColor>
              ↑↓ select · Enter open · r rename · Esc cancel
            </Text>
          )}
        </Box>
      );
    };

    instance = render(
      <Picker />,
      {
        exitOnCtrlC: false,
      },
    );
  });
}
