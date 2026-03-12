# T3 Code

T3 Code is a minimal web GUI for coding agents. Currently Codex-first, with Claude Code support coming soon.

## How to use

> [!WARNING]
> You need to have [Codex CLI](https://github.com/openai/codex) installed and authorized for T3 Code to work.

```bash
npx t3
```

You can also just install the desktop app. It's cooler.

Install the [desktop app from the Releases page](https://github.com/pingdotgg/t3code/releases)

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

## Docker dev

Use Docker if you want a reproducible local environment for developing T3 Code itself.
The Docker setup uses a dedicated dev state volume so it does not share T3 thread DB state with non-dev environments.

```bash
make docker-build
make docker-up
```

Docker dev defaults to `http://localhost:15733` so it does not collide with local runs on `5733`.

Full workflow docs: [docs/docker-dev.md](./docs/docker-dev.md)

Need Docker dev without `codex login`? You can run against a custom proxy gateway via env vars
(`T3CODE_CODEX_PROXY_BASE_URL`, `T3CODE_CODEX_PROXY_API_KEY`, `T3CODE_CODEX_PROFILE`).

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
