# slopvibez

A small terminal coding agent for local OpenAI-compatible models.

```sh
npm i -g slopvibez
slopvibez
```

It connects to `http://127.0.0.1:8000` by default. Configure the model, URL, context size, and approval mode in:

```text
~/.config/slopvibez/config.toml
```

Resume your most recent conversation:

```sh
slopvibez --continue
```
