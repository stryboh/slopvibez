import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "smol-toml";

export type ApprovalMode = "auto" | "manual";

const defaults = {
  url: "http://127.0.0.1:8000",
  model: "Qwen3.5-4B-MLX-4bit",
  context_size: 32768,
  approval_mode: "manual" as ApprovalMode,
};

function loadConfig() {
  const configPath = join(homedir(), ".config", "slopvibez", "config.toml");

  if (!existsSync(configPath)) {
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw);
    return {
      url: (parsed.url as string) ?? defaults.url,
      model: (parsed.model as string) ?? defaults.model,
      context_size: (parsed.context_size as number) ?? defaults.context_size,
      approval_mode: (parsed.approval_mode as ApprovalMode) ?? defaults.approval_mode,
    };
  } catch {
    console.warn(`Failed to parse ${configPath}, using defaults`);
    return defaults;
  }
}

const config = loadConfig();

export const URL = config.url;
export const MODEL = config.model;
export const CONTEXT_SIZE = config.context_size;
export const APPROVAL_MODE = config.approval_mode;
