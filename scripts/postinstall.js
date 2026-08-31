import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configDir = join(homedir(), ".config", "slopvibez");
const configPath = join(configDir, "config.toml");
const defaultConfig = join(import.meta.dirname, "..", "config.toml");

if (!existsSync(configPath)) {
  mkdirSync(configDir, { recursive: true });
  copyFileSync(defaultConfig, configPath);
  console.log(` Created ${configPath}`);
}
