#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  Bytebell — one-command setup (V1 / git-clone path)
#  Usage: curl -fsSL https://raw.githubusercontent.com/kaushalya4s5s7/bytebell-oss/main/install.sh | bash
# ─────────────────────────────────────────────

REPO_URL="https://github.com/ByteBell/bytebell-oss"
DEFAULT_MODEL="deepseek/deepseek-v4-flash"

# ── helpers ──────────────────────────────────

print_step() { echo ""; echo "▶  $1"; }
print_ok()   { echo "  ✓  $1"; }
print_err()  { echo ""; echo "  ✗  ERROR: $1" >&2; }
print_info() { echo "  •  $1"; }

# ── 1. prerequisite checks ───────────────────

print_step "Checking prerequisites"

if ! command -v bun &>/dev/null; then
  print_err "Bun is not installed."
  echo ""
  echo "  Install it with:"
  echo "    curl -fsSL https://bun.sh/install | bash"
  echo "  then re-run this script."
  exit 1
fi
print_ok "Bun $(bun --version)"

if ! command -v docker &>/dev/null; then
  print_err "Docker is not installed."
  echo ""
  echo "  Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
  echo "  then re-run this script."
  exit 1
fi

if ! docker info &>/dev/null; then
  print_err "Docker is installed but not running. Start Docker Desktop and retry."
  exit 1
fi
print_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

if ! command -v git &>/dev/null; then
  print_err "git is not installed. Install it and retry."
  exit 1
fi
print_ok "git $(git --version | awk '{print $3}')"

# ── 2. collect required inputs up-front ──────

echo ""
echo "════════════════════════════════════════"
echo "  Bytebell setup — a few quick questions"
echo "════════════════════════════════════════"
echo ""

# LLM provider
echo "  Which LLM provider do you want to use?"
echo "    1) OpenRouter  (API key required — https://openrouter.ai)"
echo "    2) Ollama      (local, free — must already be running)"
echo ""
read -r -p "  Enter 1 or 2 [default: 1]: " PROVIDER_CHOICE
PROVIDER_CHOICE=${PROVIDER_CHOICE:-1}

if [ "$PROVIDER_CHOICE" = "2" ]; then
  LLM_PROVIDER="ollama"
  echo ""
  read -r -p "  Ollama URL [default: http://localhost:11434]: " OLLAMA_URL
  OLLAMA_URL=${OLLAMA_URL:-"http://localhost:11434"}
  echo ""
  read -r -p "  Ollama model name (e.g. llama3, mistral): " OLLAMA_MODEL
  while [ -z "$OLLAMA_MODEL" ]; do
    echo "  Model name is required."
    read -r -p "  Ollama model name: " OLLAMA_MODEL
  done
  OPENROUTER_KEY=""
  OPENROUTER_MODEL=""
else
  LLM_PROVIDER="openrouter"
  echo ""
  echo "  OpenRouter API key (input hidden):"
  read -r -s -p "  sk-or-...: " OPENROUTER_KEY
  echo ""
  while [ -z "$OPENROUTER_KEY" ]; do
    echo "  API key cannot be empty."
    read -r -s -p "  sk-or-...: " OPENROUTER_KEY
    echo ""
  done
  echo ""
  read -r -p "  OpenRouter model [default: $DEFAULT_MODEL]: " OPENROUTER_MODEL
  OPENROUTER_MODEL=${OPENROUTER_MODEL:-$DEFAULT_MODEL}
  OLLAMA_URL=""
  OLLAMA_MODEL=""
fi

# Repo to index (optional — user can run bytebell index later)
echo ""
read -r -p "  GitHub repo to index after boot (leave blank to skip): " INDEX_URL

# ── 3. clone ─────────────────────────────────

print_step "Cloning Bytebell"

if [ -d "bytebell-oss" ]; then
  print_info "bytebell-oss/ already exists — pulling latest instead of cloning"
  git -C bytebell-oss pull --ff-only
else
  git clone "$REPO_URL"
fi
cd bytebell-oss
print_ok "Repository ready"

# ── 4. install dependencies ───────────────────

print_step "Installing dependencies (bun install)"
bun install --frozen-lockfile
print_ok "Dependencies installed"

# ── 5. link the bytebell binary ───────────────

print_step "Linking bytebell binary"
cd packages/cli
bun link
cd ../..
print_ok "bytebell linked → $(command -v bytebell 2>/dev/null || echo 'not yet on PATH — see note below')"

# ── 6. configure ──────────────────────────────

print_step "Writing configuration"

bytebell set llm-provider "$LLM_PROVIDER"

if [ "$LLM_PROVIDER" = "openrouter" ]; then
  bytebell set openrouter-api-key "$OPENROUTER_KEY"
  bytebell set openrouter-model "$OPENROUTER_MODEL"
  print_ok "OpenRouter configured (model: $OPENROUTER_MODEL)"
else
  bytebell set ollama-url "$OLLAMA_URL"
  bytebell set ollama-model "$OLLAMA_MODEL"
  print_ok "Ollama configured (model: $OLLAMA_MODEL)"
fi

# ── 7. boot infra + server ────────────────────

print_step "Booting Docker infra + Bytebell server"
print_info "First boot pulls Docker images — this can take a couple of minutes"
bytebell boot
print_ok "Server is up"

# ── 8. index repo (optional) ──────────────────

if [ -n "$INDEX_URL" ]; then
  print_step "Indexing $INDEX_URL"
  bytebell index "$INDEX_URL"
  print_ok "Indexing started — run 'bytebell ls' to watch progress"
fi

# ── 9. done ───────────────────────────────────

echo ""
echo "════════════════════════════════════════"
echo "  Bytebell is running!"
echo ""
echo "  MCP endpoint : http://127.0.0.1:8080/mcp"
echo ""
echo "  Connect Claude Code:"
echo "    claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp"
echo ""
if [ -z "$INDEX_URL" ]; then
  echo "  Index a repo:"
  echo "    bytebell index https://github.com/owner/repo"
  echo ""
fi
echo "  Watch indexing progress:"
echo "    bytebell ls"
echo ""
echo "  Full command reference: https://github.com/ByteBell/bytebell-oss/blob/main/commands.md"
echo "════════════════════════════════════════"
echo ""
