FROM node:24-bookworm-slim

ARG BUN_VERSION=1.3.9
ARG CODEX_NPM_VERSION=latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
    unzip \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash -s -- bun-v${BUN_VERSION} \
  && cp /root/.bun/bin/bun /usr/local/bin/bun \
  && chmod +x /usr/local/bin/bun

RUN npm install -g @openai/codex@${CODEX_NPM_VERSION}

RUN useradd -m -s /bin/bash dev

USER dev
WORKDIR /workspace

ENV HOME=/home/dev
ENV CODEX_HOME=/home/dev/.codex
ENV T3CODE_STATE_DIR=/home/dev/.t3-dev/state
ENV PATH=/home/dev/.bun/bin:/usr/local/bin:/usr/bin:/bin
ENV CHOKIDAR_USEPOLLING=1
ENV WATCHPACK_POLLING=true

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "-lc", "bun install && bun run dev"]
