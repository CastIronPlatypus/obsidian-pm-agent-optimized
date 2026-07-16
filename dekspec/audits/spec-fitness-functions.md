<!--
  Sibling-SSoT Fitness Functions registry
  Consumed by `/doctor` Stage 2 Phase 2J (inlined fidelity body).

  Each invariant declares a domain fact whose canonical home should be the
  only place that fact is stated. The audit greps the configured scopes and
  emits findings when copies of the fact appear without citing the canonical
  home, when the fact's expected count drifts, or when forbidden phrasings
  reappear.

  Per-invariant schema:
    id:                      F-NN (sequential)
    fact:                    one-line plain-English description
    canonical_home:          path:section where the fact is defined
    pattern:                 grep-compatible regex
    scopes:                  list of glob roots to scan
    expected_count: N        bounded-occurrence rule (miscount = IMPORTANT)
    unbounded_with_citation: non-Amendment-Log hits must cite canonical_home
    forbidden: true          non-Amendment-Log hits are CRITICAL
    citation_distance_lines: optional integer (default 5)
    severity:                CRITICAL | IMPORTANT | MINOR

  Hand-author entries below and re-run `/doctor`.
  An empty registry is valid — Phase 2J no-ops and emits zero findings.
-->

# Sibling-SSoT Fitness Functions

_No invariants registered yet._
