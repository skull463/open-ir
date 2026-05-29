#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  Bytebell — one-command setup (V1 / git-clone path)
#  Usage: curl -fsSL https://raw.githubusercontent.com/ByteBell/open-ir/main/install.sh | bash
# ─────────────────────────────────────────────

REPO_URL="https://github.com/ByteBell/open-ir"

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

check_docker_running() {
  docker info >/dev/null 2>&1 &
  local pid=$!
  local count=0
  while kill -0 $pid 2>/dev/null; do
    sleep 1
    count=$((count + 1))
    if [ $count -ge 5 ]; then
      kill -9 $pid 2>/dev/null || true
      return 1
    fi
  done
  wait $pid
  return $?
}

if ! check_docker_running; then
  print_err "Docker is installed but not running. Start Docker Desktop and retry."
  exit 1
fi
print_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

if ! command -v git &>/dev/null; then
  print_err "git is not installed. Install it and retry."
  exit 1
fi
print_ok "git $(git --version | awk '{print $3}')"

# ── 2. clone ─────────────────────────────────

print_step "Cloning Bytebell"

if [ -d "open-ir" ]; then
  print_info "open-ir/ already exists — pulling latest"
  git -C open-ir pull --ff-only
else
  git clone "$REPO_URL"
fi
cd open-ir
REPO_DIR="$(pwd)"
print_ok "Repository ready"

# ── 3. install dependencies ───────────────────

print_step "Installing dependencies"
bun install --frozen-lockfile
print_ok "Dependencies installed"

# ── 4. wire the bytebell binary ──────────────
#  bun link only registers the package name — it does not update the
#  ~/.bun/bin symlink when a stale global install already exists.
#  A direct symlink to the workspace entry point is the reliable path.

print_step "Wiring bytebell binary"
BUN_BIN_DIR="$(dirname "$(which bun)")"
ENTRY="$REPO_DIR/packages/cli/src/index.ts"
ln -sf "$ENTRY" "$BUN_BIN_DIR/bytebell"
print_ok "bytebell → $ENTRY"

# ── 5. done ───────────────────────────────────

echo ""
echo "════════════════════════════════════════"
echo "  Bytebell installed!"
echo ""
echo "  Run the setup wizard to configure your LLM provider and boot:"
echo ""
echo "    bytebell setup"
echo ""
echo "  Commands reference:"
echo "    https://github.com/ByteBell/open-ir/blob/main/commands.md"
echo "════════════════════════════════════════"
echo ""
