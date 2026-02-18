#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/docs/wiki"
WIKI_DIR="$REPO_ROOT/.tmp/wiki"

SSH_URL="git@github.com:kpax2049/loramapr.wiki.git"
HTTPS_URL="https://github.com/kpax2049/loramapr.wiki.git"

MODE="ssh"
COMMIT_MESSAGE="Sync wiki from docs/wiki"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/wiki/sync-wiki.sh [--ssh|--https] [--message "Sync wiki from docs/wiki"]

Options:
  --ssh      Prefer SSH URL and fall back to HTTPS on failure (default)
  --https    Use HTTPS URL only
  --message  Commit message override
  -h, --help Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh)
      MODE="ssh"
      ;;
    --https)
      MODE="https"
      ;;
    --message)
      shift
      [[ $# -gt 0 ]] || die "--message requires a value"
      COMMIT_MESSAGE="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown argument: $1"
      ;;
  esac
  shift
done

command -v git >/dev/null 2>&1 || die "git is required"

[[ -d "$SOURCE_DIR" ]] || die "Missing docs directory: $SOURCE_DIR"
shopt -s nullglob
MD_FILES=("$SOURCE_DIR"/*.md)
shopt -u nullglob
(( ${#MD_FILES[@]} > 0 )) || die "No .md files found in $SOURCE_DIR"

clone_or_refresh_wiki() {
  local url="$1"

  mkdir -p "$REPO_ROOT/.tmp"
  if [[ -d "$WIKI_DIR/.git" ]]; then
    git -C "$WIKI_DIR" remote set-url origin "$url"
    git -C "$WIKI_DIR" fetch origin --prune

    local default_branch=""
    default_branch="$(git -C "$WIKI_DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
    if [[ -z "$default_branch" ]]; then
      if git -C "$WIKI_DIR" show-ref --verify --quiet refs/remotes/origin/main; then
        default_branch="main"
      elif git -C "$WIKI_DIR" show-ref --verify --quiet refs/remotes/origin/master; then
        default_branch="master"
      else
        default_branch="main"
      fi
    fi

    git -C "$WIKI_DIR" checkout "$default_branch" >/dev/null 2>&1 || git -C "$WIKI_DIR" checkout -B "$default_branch"
    if git -C "$WIKI_DIR" show-ref --verify --quiet "refs/remotes/origin/$default_branch"; then
      git -C "$WIKI_DIR" reset --hard "origin/$default_branch" >/dev/null
    fi
  else
    rm -rf "$WIKI_DIR"
    git clone "$url" "$WIKI_DIR"
  fi
}

if [[ "$MODE" == "ssh" ]]; then
  if ! clone_or_refresh_wiki "$SSH_URL"; then
    echo "SSH wiki clone/fetch failed; falling back to HTTPS..." >&2
    clone_or_refresh_wiki "$HTTPS_URL"
  fi
else
  clone_or_refresh_wiki "$HTTPS_URL"
fi

if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete --exclude '.git/' "$SOURCE_DIR/" "$WIKI_DIR/"
else
  while IFS= read -r -d '' src_file; do
    cp "$src_file" "$WIKI_DIR/$(basename "$src_file")"
  done < <(find "$SOURCE_DIR" -mindepth 1 -maxdepth 1 -type f -print0)

  while IFS= read -r -d '' dst_file; do
    base_name="$(basename "$dst_file")"
    if [[ ! -f "$SOURCE_DIR/$base_name" ]]; then
      rm -f "$dst_file"
    fi
  done < <(find "$WIKI_DIR" -mindepth 1 -maxdepth 1 -type f -print0)
fi

git -C "$WIKI_DIR" status

if [[ -z "$(git -C "$WIKI_DIR" status --porcelain)" ]]; then
  current_hash="$(git -C "$WIKI_DIR" rev-parse --short HEAD)"
  echo "Wiki already up to date. Latest commit: $current_hash"
  exit 0
fi

git -C "$WIKI_DIR" add -A
git -C "$WIKI_DIR" commit -m "$COMMIT_MESSAGE"
git -C "$WIKI_DIR" push

new_hash="$(git -C "$WIKI_DIR" rev-parse --short HEAD)"
echo "Wiki sync complete. Latest commit: $new_hash"
