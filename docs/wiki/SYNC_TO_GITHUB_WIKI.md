# Sync to GitHub Wiki

Use the helper script to mirror `docs/wiki/*` into the GitHub Wiki git repository.

## One-time prerequisites

- You have push access to the main repo and its Wiki.
- Authentication is configured:
- SSH option: your SSH key is added to your GitHub account.
- HTTPS option: you can authenticate with a Personal Access Token (PAT) when prompted.

Wiki remote placeholders:

- SSH: `<YOUR_WIKI_GIT_URL>` (for this repo, typically `git@github.com:...wiki.git`)
- HTTPS: `<YOUR_WIKI_GIT_URL>` (for this repo, typically `https://github.com/...wiki.git`)

## Run the sync script

From repo root:

```bash
./scripts/wiki/sync-wiki.sh
```

Options:

```bash
# force HTTPS instead of default SSH-first behavior
./scripts/wiki/sync-wiki.sh --https

# custom commit message
./scripts/wiki/sync-wiki.sh --message "Sync wiki docs"
```

What the script does:

1. Verifies `docs/wiki/` exists and contains markdown files.
2. Clones/refreshes the wiki repo under `.tmp/wiki`.
3. Syncs `docs/wiki/` into wiki root with delete semantics to avoid drift.
4. Commits and pushes only when changes exist.

## Common failures

### Authentication failed (SSH)

Symptoms:

- `Permission denied (publickey)` during clone/fetch/push.

Fixes:

- Ensure your SSH key is loaded and linked to GitHub.
- Re-run with HTTPS mode:

```bash
./scripts/wiki/sync-wiki.sh --https
```

### HTTPS + 2FA issues

Symptoms:

- Username/password auth rejected.

Fixes:

- Use a PAT when prompted by Git for HTTPS operations.
- Ensure PAT has repo/wiki write access as required by your GitHub policy.

### Detached HEAD or branch state issues in `.tmp/wiki`

Symptoms:

- Push rejected or git reports detached HEAD.

Fixes:

- Re-run the script; it refreshes `.tmp/wiki` against remote default branch.
- If needed, remove temp clone and retry:

```bash
rm -rf .tmp/wiki
./scripts/wiki/sync-wiki.sh
```

### No changes pushed

Symptoms:

- Script reports wiki already up to date.

Fix:

- This is expected when `docs/wiki/*` and wiki repo content are identical.
