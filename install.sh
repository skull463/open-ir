#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  Bytebell — one-command setup (V1 / git-clone path)
#  Usage: curl -fsSL https://raw.githubusercontent.com/kaushalya4s5s7/bytebell-oss/main/install.sh | bash
# ─────────────────────────────────────────────

REPO_URL="https://github.com/kaushalya4s5s7/bytebell-oss"

# ── helpers ──────────────────────────────────

print_step() { echo ""; echo "▶  $1"; }
print_ok()   { echo "  ✓  $1"; }
print_err()  { echo ""; echo "  ✗  ERROR: $1" >&2; }
print_info() { echo "  •  $1"; }

# When piped through curl, stdin is the script itself — not the terminal.
# All read calls must use /dev/tty so they block for real keyboard input.
# -p flag is unreliable when stdin is redirected; print prompt with printf first.
prompt() {
  local __var="$1"
  local __msg="$2"
  local __val
  printf "%s" "$__msg" >/dev/tty
  IFS= read -r __val </dev/tty
  eval "$__var=\"\$__val\""
}

prompt_secret() {
  local __var="$1"
  local __msg="$2"
  local __val
  printf "%s" "$__msg" >/dev/tty
  IFS= read -r -s __val </dev/tty
  printf "\n" >/dev/tty
  eval "$__var=\"\$__val\""
}

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

if ! docker info &>/dev/null 2>&1; then
  print_err "Docker is installed but not running. Start Docker Desktop and retry."
  exit 1
fi
print_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

if ! command -v git &>/dev/null; then
  print_err "git is not installed. Install it and retry."
  exit 1
fi
print_ok "git $(git --version | awk '{print $3}')"

# ── 2. collect required inputs ───────────────

echo ""
echo "════════════════════════════════════════"
echo "  Bytebell setup — a few quick questions"
echo "════════════════════════════════════════"

# ── LLM provider ─────────────────────────────

echo ""
echo "  Which LLM provider do you want to use?"
echo "    1) OpenRouter  (API key required — https://openrouter.ai)"
echo "    2) Ollama      (local, free — must already be running)"
echo ""

PROVIDER_CHOICE=""
while [ "$PROVIDER_CHOICE" != "1" ] && [ "$PROVIDER_CHOICE" != "2" ]; do
  prompt PROVIDER_CHOICE "  Enter 1 or 2: "
  if [ "$PROVIDER_CHOICE" != "1" ] && [ "$PROVIDER_CHOICE" != "2" ]; then
    echo "  Please enter 1 or 2."
  fi
done

if [ "$PROVIDER_CHOICE" = "2" ]; then
  LLM_PROVIDER="ollama"

  echo ""
  OLLAMA_URL=""
  while [ -z "$OLLAMA_URL" ]; do
    prompt OLLAMA_URL "  Ollama URL (e.g. http://localhost:11434): "
    if [ -z "$OLLAMA_URL" ]; then
      echo "  URL is required."
    fi
  done

  echo ""
  OLLAMA_MODEL=""
  while [ -z "$OLLAMA_MODEL" ]; do
    prompt OLLAMA_MODEL "  Ollama model name (e.g. llama3, mistral): "
    if [ -z "$OLLAMA_MODEL" ]; then
      echo "  Model name is required."
    fi
  done

  OPENROUTER_KEY=""
  OPENROUTER_MODEL=""

else
  LLM_PROVIDER="openrouter"

  echo ""
  OPENROUTER_KEY=""
  while [ -z "$OPENROUTER_KEY" ]; do
    prompt_secret OPENROUTER_KEY "  OpenRouter API key (hidden): "
    if [ -z "$OPENROUTER_KEY" ]; then
      echo "  API key is required."
    fi
  done

  echo ""
  OPENROUTER_MODEL=""
  while [ -z "$OPENROUTER_MODEL" ]; do
    prompt OPENROUTER_MODEL "  OpenRouter model (e.g. deepseek/deepseek-v4-flash): "
    if [ -z "$OPENROUTER_MODEL" ]; then
      echo "  Model is required. Find models at https://openrouter.ai/models"
    fi
  done

  OLLAMA_URL=""
  OLLAMA_MODEL=""
fi

# ── repo to index (optional) ─────────────────

echo ""
prompt INDEX_URL "  GitHub repo URL to index after boot (press Enter to skip): "

# ── 3. clone ─────────────────────────────────

print_step "Cloning Bytebell"

if [ -d "bytebell-oss" ]; then
  print_info "bytebell-oss/ already exists — pulling latest"
  git -C bytebell-oss pull --ff-only
else
  git clone "$REPO_URL"
fi
cd bytebell-oss
print_ok "Repository ready"

# ── 4. install dependencies ───────────────────

print_step "Installing dependencies"
bun install --frozen-lockfile
print_ok "Dependencies installed"

# ── 5. link the bytebell binary ───────────────

print_step "Linking bytebell binary"
cd packages/cli
bun link
cd ../..
print_ok "bytebell linked"

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

# ── 7. boot ───────────────────────────────────

print_step "Booting Docker infra + Bytebell server"
print_info "First boot pulls Docker images — this can take a few minutes"
# Shut down any previously running server so the freshly installed binary is used.
bytebell shutdown --keep-docker 2>/dev/null || true
bytebell boot
print_ok "Server is up"

# ── 8. index (optional) ───────────────────────

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
echo "  Commands reference:"
echo "    https://github.com/kaushalya4s5s7/bytebell-oss/blob/main/commands.md"
echo "════════════════════════════════════════"
echo ""
