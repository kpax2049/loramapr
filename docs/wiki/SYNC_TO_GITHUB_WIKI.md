# Sync to GitHub Wiki

Use these steps to mirror `docs/wiki/*` into your GitHub Wiki repository.

## 1) Clone wiki repository

```bash
git clone <YOUR_WIKI_GIT_URL>
cd <YOUR_WIKI_REPO_DIR>
```

## 2) Copy wiki markdown from this repo

From the main repo root, sync files into the wiki repo root:

```bash
rsync -av --delete docs/wiki/ <YOUR_WIKI_REPO_DIR>/
```

If `rsync` is unavailable, use `cp`:

```bash
cp -f docs/wiki/* <YOUR_WIKI_REPO_DIR>/
```

## 3) Commit and push wiki changes

```bash
cd <YOUR_WIKI_REPO_DIR>
git add .
git commit -m "Sync wiki from docs/wiki"
git push
```

## Notes

- GitHub Wiki uses file names as page names.
- Keep `_Sidebar.md`, `_Header.md`, and `_Footer.md` in the wiki repo root.
- Re-run this sync after updating `docs/wiki/*` in the main repository.
