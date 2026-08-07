# Security Improvements Plan

## Chapter 1 — Supply Chain and Dependency Hardening

This document captures a concise set of security improvements for the repository, focused on reducing the risk of compromised npm packages, malicious install-time behavior, and dependency drift.

## Goals

- Reduce the chance of introducing compromised or risky npm packages.
- Detect suspicious dependency behavior early.
- Make dependency review lightweight enough to run manually or in regular maintenance tasks.
- Provide a practical triage path for later implementation.

## Recommended Actions

### 1. Add a regular dependency audit step
- Run npm audit as part of routine validation.
- Prefer a lightweight command for recurring use:
  - npm audit --omit=dev
- Keep this as a baseline check for known vulnerabilities.

### 2. Add a manual or CI check for install-time scripts
- Review dependencies that define lifecycle scripts such as preinstall, install, postinstall, and prepare.
- Treat unexpected script use as a high-signal risk indicator.
- This is especially relevant for supply-chain malware that executes during install.

### 3. Add a simple suspicious-file scan after install
- Scan installed dependencies for unexpected files such as:
  - setup.mjs
  - Math_Symbol.js
  - math_init.js
- These are useful indicators for certain npm supply-chain compromises.
- This can be run manually or as a small scripted check.

### 4. Keep lockfiles pinned and reviewed
- Commit package-lock.json and review it regularly.
- Prefer pinned versions for critical dependencies where practical.
- Review unexpected version changes during dependency updates.

### 5. Add a lightweight CI workflow for basic supply-chain checks
- Use GitHub Actions to run dependency audit on pull requests and pushes.
- Keep the workflow simple and fast so it is easy to maintain.
- The goal is to catch obvious regressions early without heavy operational overhead.

### 6. Consider external supply-chain monitoring for later adoption
- Evaluate StepSecurity or similar tools for stronger compromised-package detection.
- These are valuable when the repo grows or when dependency risk increases.
- They are not required for the initial baseline, but are worth tracking as a later phase.

## Suggested Triage Order

1. Baseline dependency audit
2. Install-script review
3. Suspicious-file scanning
4. Lockfile and version review discipline
5. CI workflow integration
6. External monitoring tools

## Suggested Initial Scope

For the first iteration, prioritize low-cost and low-friction actions:
- npm audit
- simple install-script checks
- basic suspicious-file scan
- lockfile review discipline

This creates a practical foundation without introducing significant process overhead.

## Open Questions

- Should this be enforced in CI only, or also as a manual pre-release checklist?
- Are there any internal security policies that require stronger tooling than this baseline?
- Does the project want a dedicated dependency policy for high-risk packages?
