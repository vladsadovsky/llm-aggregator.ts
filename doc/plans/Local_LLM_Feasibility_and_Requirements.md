# Local LLM Feasibility and Requirements for Phase 2 Automation

Status: Draft requirement document  
Date: 2026-08-04  
Owner: Vlad Sadovsky  
Scope: LLM Aggregator v2 roadmap, Phase 2 enablement without mandatory subscription APIs

## 1. Purpose

Define product and technical requirements for enabling Phase 2 auto-features with local or self-hosted models, minimizing recurring API cost while preserving quality for:

- Auto title generation
- Auto tag suggestion
- Workflow-state suggestions for QA/thread progress states (closure, clear answer, dead-end, speculative)

This document also defines requirements for integrating a LAN-hosted DGX Spark model server and evaluating whether manual labeling can train automation over time.

## 2. Background and Current State

The codebase already includes major LLM foundations:

- Provider capability split and registry are present.
- Batch LLM job infrastructure is present and reusable.
- Metadata generation already uses structured JSON output with parse/validate behavior.
- Local Ollama and Azure adapters exist but are not fully wired into active runtime/UI provider selection.
- Local endpoint policy currently allows loopback-only endpoints.
- Settings UI currently exposes OpenAI/Anthropic paths for normal user flow.

Implication: architecture is close to supporting local and self-hosted flow, but provider surfacing and endpoint policy updates are required for direct DGX LAN use.

## 3. Problem Statement

Phase 2 auto-features currently depend on paid cloud APIs for practical use. The product goal is to provide high-quality automation for this app's narrow tasks without requiring a subscription fee.

## 4. Goals

- Support zero-subscription operation for core Phase 2 auto features.
- Preserve user trust through review-first suggestion workflow.
- Maintain acceptable quality versus current frontier-model-assisted workflow for this app's tasks.
- Support both local-machine and LAN-hosted inference options.
- Reuse existing batch/metadata pipelines to keep implementation incremental and low-risk.

## 5. Non-Goals

- Frontier-level parity for all general reasoning tasks.
- Autonomous, unreviewed archive mutations.
- Mandatory bundling of very large models into the base installer.
- Full multimodal/offline assistant behavior outside Phase 2 needs.

## 6. Functional Requirements

### FR-1 Local and Self-Hosted Provider Availability

App must allow selecting at least one local or self-hosted provider path for completion tasks used by auto-title and auto-tag features.

### FR-2 Structured Output Contract

Auto features must require strict structured output with validation and rejection on schema mismatch, following existing batch validation patterns.

### FR-3 Review and Apply Workflow

All generated suggestions for titles, tags, and workflow-state labels must be user-reviewable before persistence.

### FR-4 Workflow-State Suggestion

App must support model-generated suggestions for workflow-state labels and confidence labels, with explicit user approval.

### FR-5 Embedding Compatibility

If semantic features are enabled, selected provider path must declare embedding capability or degrade gracefully with explicit user messaging.

### FR-6 Cost Transparency

Session usage and estimated cost must remain visible and accurate across local and remote providers.

### FR-7 Experimental Gating

Local and self-hosted provider exposure must remain behind experimental feature controls until stabilization is complete.

## 7. DGX Spark LAN Requirements

### FR-8 LAN Endpoint Support

App must provide a secure option to connect to a trusted LAN inference endpoint for completion and optional embedding calls.

### FR-9 Policy and Security Controls

LAN support must include:

- Explicit trusted-host allowlist
- HTTPS requirement where feasible
- No credential leakage in logs
- Clear rejection reasons for policy failures

### FR-10 OpenAI-Compatible Path

Preferred server protocol is OpenAI-compatible API surface to minimize adapter and maintenance cost.

## 8. Learning from Manual Marking Requirements

### FR-11 Manual Labels as Ground Truth

User-applied workflow-state labels are first-class training data for future automation.

### FR-12 Progressive Automation

System must start with suggestion-only behavior and allow later progression to higher automation thresholds based on measured quality.

### FR-13 Confidence and Calibration

Model predictions for workflow states must include confidence scoring sufficient for thresholding and review prioritization.

### FR-14 Human Override Protection

No generated state may overwrite an explicitly manual user state without explicit confirmation.

## 9. Model Strategy Requirements

### MR-1 Built-In Small Model Feasibility

Support at least one small local model strategy suitable for text-analysis-only tasks (titles, tags, workflow-state suggestions).

### MR-2 Recommended Size Bands

Document and evaluate three practical size tiers:

- Small specialized classifier or compact model: approximately 0.1 GB to 0.8 GB
- Balanced local instruct model: approximately 2 GB to 6 GB
- Quality-first local model: approximately 9 GB to 24 GB

### MR-3 Preferred Initial Target

Balanced tier should be the first v2 target due to quality/size tradeoff.

### MR-4 Separate Embedding Model Option

System should allow distinct completion and embedding models when beneficial.

## 10. Quality Targets and Evaluation

### QT-1 Task-Specific Benchmark Sets

Define benchmark sets from real archive content for:

- Title quality
- Tag precision and usefulness
- Workflow-state classification quality

### QT-2 Initial Acceptance Targets

Suggested initial thresholds:

- Title accept-without-edit rate: >= 60%
- Tag precision among accepted tags: >= 75%
- Workflow-state macro F1 against manual labels: >= 0.75

### QT-3 Regression Monitoring

Any model or prompt change must be evaluated against fixed benchmark snapshots before rollout.

## 11. Packaging and Distribution Requirements

### PR-1 Distribution Strategy

Large model artifacts must not block base app distribution for users who do not need local inference.

### PR-2 Optional Asset Delivery

Preferred approach is optional model download and setup flow rather than mandatory bundling into the primary installer.

### PR-3 Upgrade Safety

Model updates must be versioned and reversible without data loss to user archive.

## 12. Risks and Tradeoffs

- Installer bloat and update friction if models are bundled by default
- Hardware variability and latency on CPU-only environments
- License constraints on redistribution and packaging
- Quality variance versus frontier APIs
- Security posture changes when enabling LAN endpoints

## 13. Implementation Phasing

### Phase A: Enable Existing Local Path

- Wire existing local provider adapter into runtime and settings flow behind experimental flag.
- Keep review-first UX for generated suggestions.

### Phase B: DGX LAN Connectivity

- Add trusted LAN endpoint policy and configuration surface.
- Validate OpenAI-compatible serving path.

### Phase C: Workflow-State Learning Bootstrap

- Collect approved manual labels and accepted/rejected suggestions.
- Train or fine-tune compact classifier for workflow-state prediction.
- Keep LLM for title/tag generation where needed.

### Phase D: Stabilization and Defaulting Decision

- Evaluate benchmarks, reliability, and UX overhead.
- Decide whether local path becomes the default recommendation.

## 14. Dependencies

- Phase 0 provider/settings foundations
- Batch runner and review shell workflows
- Metadata field and migration decisions in roadmap
- Security requirements for endpoint policy and secrets handling

## 15. Acceptance Criteria

This requirement is complete when all are true:

- User can run core Phase 2 auto-features without paid subscription APIs.
- Local or LAN-hosted path is available in settings behind controlled feature gating.
- Auto title, auto tag, and workflow-state suggestions run through validated structured outputs and review/apply UX.
- Quality metrics are measured against benchmark datasets and meet target thresholds.
- Packaging approach is documented with size impact and update strategy.

## 16. Open Decisions

- Whether to support direct LAN endpoints first or require local loopback relay in initial release
- Which first production model family to standardize for balanced tier
- Whether embeddings are mandatory in the same phase or can remain optional
- Final thresholds for default automation behavior versus suggestion-only behavior

## 17. Consolidated Model Recommendations and Selection Matrix

This section intentionally keeps model-selection guidance inside the same requirement document to avoid plan fragmentation.

### 17.1 Built-In and Local Model Viability Summary

For this application's task profile (short-form title generation, tag suggestion, workflow-state classification), small and medium local models are viable if output is constrained and review-first UX remains mandatory.

- Fully autonomous write-through behavior is out of scope.
- Recommendation quality should be measured by accept-without-edit and reviewer agreement, not generic benchmark rankings.

### 17.2 Recommended Model Tiers for This Product

#### Tier S: Minimal footprint (classifier-first)

- Intended use: workflow-state classification first, optional lightweight tag class prediction
- Typical artifact size: about 0.1 GB to 0.8 GB
- Strengths: fastest inference, easiest bundling, strongest determinism for class labels
- Weaknesses: weaker natural-language title generation
- Recommendation: use as a secondary specialized model, not as the only model for Phase 2

#### Tier M: Balanced local assistant (recommended initial target)

- Intended use: one model for title, tags, and suggestion rationale
- Typical artifact size: about 2 GB to 6 GB (quantized)
- Strengths: best quality-to-size ratio for this app
- Weaknesses: still non-trivial installer and update footprint
- Recommendation: Phase 2 primary path for local/offline usage

#### Tier L: Quality-first local deployment

- Intended use: highest local quality for difficult or ambiguous archive entries
- Typical artifact size: about 9 GB to 24 GB (quantized)
- Strengths: closest practical quality to frontier usage for this app domain
- Weaknesses: heavy hardware and distribution requirements
- Recommendation: DGX/server profile, optional for advanced users

### 17.3 Candidate Families for DGX Spark Server

To target frontier-comparable quality for this app's constrained tasks, prefer a strong instruct model plus a dedicated embedding model.

Completion model families to evaluate:

- Qwen 2.5 Instruct class (medium/large variants)
- Mistral instruct class (medium variants)
- Llama instruct class (large variants)

Embedding model families to evaluate:

- BGE family (for semantic similarity and retrieval)
- E5 family (for sentence-level embedding quality)

Selection criteria:

- Structured JSON reliability under strict output schema
- Cost-free or low-cost serving stability in continuous batch jobs
- Latency consistency for interactive review flows
- License compatibility with intended distribution and deployment model

### 17.4 DGX Integration Path Requirement (Practical Constraint)

Current local endpoint policy is loopback-only, so direct LAN DGX endpoint support requires one of two explicit approaches:

- Option A: add trusted LAN endpoint support with allowlist and transport policy controls
- Option B: keep loopback policy and use a local relay/proxy on the client machine

Both options must preserve endpoint validation, clear error messages, and secrets safety.

### 17.5 Recommended Decision Path

1. Ship Tier M local path first for completion tasks behind experimental gating.
2. Keep embeddings as separate capability and model choice.
3. Add DGX support via explicit trusted endpoint policy or local relay.
4. Collect manual workflow labels and accepted suggestions as training data.
5. Introduce a dedicated classifier for workflow-state automation after sufficient labeled data is collected.

### 17.6 Additional Acceptance Checks for Model Selection

Before locking a default recommended model profile, verify all of the following:

- The model meets QT-2 thresholds on archive-specific evaluation sets.
- Structured output parse-failure rate stays below 2% in batch mode.
- Median suggestion latency is acceptable for review workflow.
- Model artifact/update size is acceptable for the chosen distribution strategy.
- Operational guidance for local and DGX setup is documented in one user-facing place.
