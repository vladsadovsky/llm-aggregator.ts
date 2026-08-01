# Git Workflow Guide — llm-aggregator.ts
> Covers: branching model, git cheat sheet

---

## Table of Contents
1. [Branching Diagram](#1-branching-diagram)
2. [Git Cheat Sheet](#2-git-cheat-sheet)

---

## 1. Branching Diagram

### Branch Topology

```
main (production releases, tagged)
│
├── develop  ←─────────────────────────────────────────┐
│     │                                                 │
│     ├── feature/short-description                     │ merge via PR
│     │     └─ (feature work, rebase onto develop)      │
│     │                                                 │
│     └── bugfix/short-description                      │
│           └─ (non-release bugfixes, rebase onto dev)  │
│
├── release/vX.Y  (cut from develop, stabilisation only)
│     └─ hotfix cherry-picked in → merge → main + develop
│
└── support/v1.x  ←── long-term maintenance line
      │
      ├── hotfix/v1.x/short-description  (cut from support/v1.x)
      │     └─ fix → PR → merge into support/v1.x
      │                 └─ tag v1.Y.Z-patch
      │
      └── (cherry-picks from develop when applicable)
```

### Lifecycle Rules

| Branch prefix    | Cut from                          | Merges into                              | Lifetime                          |
|------------------|-----------------------------------|------------------------------------------|-----------------------------------|
| `feature/*`      | `develop`                         | `develop`                                | Short-lived; delete after merge   |
| `bugfix/*`       | `develop`                         | `develop`                                | Short-lived; delete after merge   |
| `release/vX.Y`   | `develop`                         | `main` + `develop`                       | Until release tag; then archive   |
| `hotfix/v1.x/*`  | `support/v1.x`                    | `support/v1.x` (+ `develop` if applicable) | Until patch tag; then delete   |
| `support/v1.x`   | tagged `v1.x` commit on `main`    | never merged away                        | Permanent maintenance line        |

### Tag Convention
- Stable releases: `v<MAJOR>.<MINOR>.<PATCH>` (e.g. `v2.3.0`)
- v1.x maintenance patches: `v1.<MINOR>.<PATCH>` (e.g. `v1.8.4`)
- Release candidates: `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` (e.g. `v2.3.0-rc.1`)

---

## 2. Git Cheat Sheet

### Repository Setup
```bash
git clone <url>                         # Clone remote repo
git remote -v                           # List remotes
git remote add upstream <url>           # Add upstream remote
git fetch --all --prune                 # Fetch all remotes, prune stale tracking refs
```

### Daily Workflow
```bash
git status                              # Working tree status
git diff                                # Unstaged changes
git diff --staged                       # Staged changes
git add <file>                          # Stage file
git add -p                              # Interactively stage hunks
git commit -m "type(scope): message"    # Commit (Conventional Commits)
git commit --amend --no-edit            # Amend last commit without changing message
git push origin <branch>               # Push branch
git push --force-with-lease            # Safe force-push (rejects if remote moved)
```

### Branching
```bash
git checkout -b feature/my-feature develop        # New feature branch from develop
git checkout -b hotfix/v1.x/fix-123 support/v1.x # New hotfix from maintenance line
git branch -d <branch>                            # Delete local branch (merged)
git push origin --delete <branch>                 # Delete remote branch
git branch -vv                                    # Show local branches + tracking info
```

### Rebasing & Merging
```bash
git fetch origin develop
git rebase origin/develop                   # Rebase current branch onto develop
git rebase -i HEAD~<N>                      # Interactive rebase (squash, fixup, reword)
git merge --no-ff <branch>                  # Merge with explicit merge commit
git merge --squash <branch>                 # Squash all commits into one staged change
```

### Cherry-Picking (v1.x patches)
```bash
git log --oneline develop               # Find commit SHAs to cherry-pick
git cherry-pick <sha>                   # Apply single commit
git cherry-pick <sha1>..<sha2>          # Apply range (exclusive start)
git cherry-pick -x <sha>                # Append "(cherry picked from commit …)" to message
git cherry-pick --abort                 # Abort on conflict
git cherry-pick --continue              # Continue after resolving conflicts
```

### Stashing
```bash
git stash push -m "wip: description"   # Stash with label
git stash list                          # List stashes
git stash pop                           # Apply and drop top stash
git stash drop stash@{N}               # Drop specific stash
```

### Inspection & History
```bash
git log --oneline --graph --decorate --all   # Visual branch graph
git log -p <file>                            # File history with diffs
git blame -L <start>,<end> <file>           # Annotate line range
git show <sha>                              # Inspect a commit
git bisect start                            # Start binary search for regression
git bisect bad                              # Mark current commit as bad
git bisect good <sha>                       # Mark known-good commit
git bisect reset                            # End bisect session
```

### Undoing Things
```bash
git restore <file>                      # Discard working-tree changes
git restore --staged <file>             # Unstage file
git revert <sha>                        # Safe undo via new commit (use on shared branches)
git reset --soft HEAD~1                 # Undo last commit, keep changes staged
git reset --mixed HEAD~1                # Undo last commit, keep changes unstaged
git reset --hard HEAD~1                 # ⚠ Destroy last commit + working-tree changes
git reflog                              # Recover lost commits/branches
```

### Tags
```bash
git tag v1.8.4 -m "chore: patch release v1.8.4"   # Annotated tag
git push origin v1.8.4                              # Push single tag
git push origin --tags                              # Push all tags
git tag -d v1.8.4                                   # Delete local tag
git push origin --delete v1.8.4                     # Delete remote tag
```

### Configuration Shortcuts
```bash
git config --global alias.lg \
  "log --oneline --graph --decorate --all"   # Pretty log alias
git config --global rerere.enabled true       # Remember conflict resolutions
git config --global pull.rebase true          # Default rebase on pull
git config --global push.autoSetupRemote true # Auto-track on first push
```



# Release Branching

## Long-Lived Branches

| Branch | Purpose |
| --- | --- |
| `release/1.x` | Maintained v1 line. Receives only v1-compatible bug, security, and compatibility fixes. |
| `master` | Stable v2 integration branch. Every commit should be usable and releasable. |
| `vlads-dev` | Active v2 development and integration. May contain work not ready for `master`. |

`release/1.x` starts at the immutable `v1.4.1` tag. It does not merge v2 work from
`vlads-dev` or `master`.

## V1 Patch Releases

Create a short-lived patch branch from `release/1.x`:

```text
fix/1.x-issue-description -> release/1.x -> tag v1.4.2
```

After validation, merge the patch into `release/1.x` and tag the resulting release
commit using the next v1 patch version. Bring the fix to v2 with a cherry-pick only
when it applies cleanly and remains relevant:

```powershell
git switch vlads-dev
git cherry-pick <v1-fix-commit>
```

## V2 Integration and Releases

Develop v2 features on short-lived feature branches from `vlads-dev`, then merge
them back into `vlads-dev`. Merge tested, coherent milestones from `vlads-dev` into
`master`. Tag release candidates and releases from `master`, for example
`v2.0.0-rc.1` and `v2.0.0`.

## Initial Setup

The v1 maintenance line is created from the existing release tag, not from the
newer `vlads-dev` branch:

```powershell
cop
```