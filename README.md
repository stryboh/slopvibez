# slopvibez

Small terminal coding agent for local OpenAI-compatible models.

```sh
bun install
bun run index.ts
```

It connects to `http://127.0.0.1:8000` by default. Change the model, URL, or approval mode in `~/.config/slopvibez/config.toml`.

## Commands

```sh
bun run index.ts --continue
bun run index.ts --resume
```

## Release

CI runs linting, type checks, and a build on every pull request and push to `main`.

To publish, configure npm trusted publishing for `stryboh/slopvibez`, bump `package.json`, then push a matching tag:

```sh
git tag v1.0.0
git push origin v1.0.0
```
