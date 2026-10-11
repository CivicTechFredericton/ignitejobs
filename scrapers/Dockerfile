# http: lightweight worker. browser: adds Playwright + Chromium for JS-rendered sites.
FROM python:3.12-slim AS http
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
CMD ["ignite-worker", "--pool", "http"]

FROM mcr.microsoft.com/playwright/python:v1.63.0-noble AS browser
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --extra browser --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --extra browser
CMD ["ignite-worker", "--pool", "browser"]
