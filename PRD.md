# Learn Harness — Plan (Draft v0.1)

Synthesized from design discussion. This is a first draft to edit/correct, not a final spec.

## 1. Vision

A fork of opencode that helps you learn while you code. As the model responds, concepts it
touches (in prose or in code it writes) get tagged. Concepts you don't yet know are highlighted
prominently and clickable — leading to a focused Socratic tutor session on that concept.
Concepts you already know are marked discreetly, and clicking them opens your existing notes
instead. Learning state lives in a global, personal Obsidian vault, so "known" status persists
across every project you use the harness on.

## 2. Base Platform

- Fork of `sst/opencode`.
- Primary delivery surface: opencode's web UI (not TUI-only) — needed for clickable inline
  highlights, notes views, and tutor sessions.

## 3. High-Level Flow

1. Main coding model completes a turn (agentic — with tool calls/file edits — or a plain chat
   turn with no tools).
2. Once all of that turn's intermediary steps are finished, a separate post-processing pipeline
   runs synchronously (blocking) over the turn's full output surface: the final chat prose, plus
   the diff of any code the agent actually added/changed that turn.
3. The pipeline's stages extract concepts, resolve their identity against the existing concept
   graph, and determine status (new/unlearned, learned, muted, snoozed).
4. The original response is shown with minimal mutation — concepts are overlaid as annotations,
   not rewritten into the text. Concepts found only in code (not in chat prose) surface as a
   rollup list attached to the turn rather than an inline highlight.
5. Clicking a tagged concept leads to different places depending on its status (see §6).

## 4. Pipeline Architecture

- Entirely separate from the main model's turn — never a tool the main model calls itself.
- Structured as a graph of modular, pluggable stages, not a single hardcoded step. Adding a new
  stage later (beyond extraction + graph-matching) should not require redesigning the pipeline.
- Hard constraint: the user-visible output must stay minimally changed from the model's actual
  words. The pipeline's job is to annotate, not to edit or rephrase.
- Applies uniformly whether the turn was full agentic coding or a plain chat-only exchange with
  no tools involved — not coupled to "coding mode."

### Stage 1 — Concept Extraction

- A separate, modular, swappable model call (not the main coding model).
- Pinned to a specific model/provider, configured independently of whatever provider/model the
  main coding session happens to be using that day.
- Input: the turn's final chat prose, plus the diff (added/changed lines only — not the whole
  file, not pre-existing surrounding code) of anything the agent wrote or edited that turn.
  Intermediate agentic "thinking"/tool-call steps are not individually scanned — only the
  finished turn's cumulative output.
- Output: concept names/canonical references — not character offsets. The client re-matches
  these back into the displayed text via string/alias matching.
- Failure handling: fail-open. If this call errors or times out, the response is shown normally,
  untagged, rather than blocking the user from seeing their answer.

### Stage 2 — Concept Graph Lookup / Matching

For each extracted concept name, resolve its identity against the existing global vault:

1. **Alias/exact-match index** — each concept note keeps a frontmatter `aliases:` list (e.g.
   `Kubernetes` lists `k8s`, `kube`). Fast, deterministic, no extra infra, and a natural surface
   for manual curation later.
2. **Embedding/vector similarity fallback** — only when there's no alias hit, search for the
   top-few semantically similar existing nodes (e.g. "container orchestration platform" →
   Kubernetes even without the word appearing).
3. **Model disambiguation** over that short candidate list (never the full vault) confirms
   match-vs-new. Keeps context small and cost flat as the vault grows into hundreds of concepts.

Produces, per concept: canonical ID, status, and — if genuinely new — proposed graph edges
(prerequisite-of / related-to / part-of) into the existing graph. Edge-proposal is model-driven
for now but sits behind a swappable interface, since graph authorship needs to be easy to change
later (e.g. to a curated-taxonomy approach).

### Future stages

Explicitly left open — the architecture needs to support adding stages later without a redesign.
None specified yet beyond extraction + matching.

## 5. Concept Graph & Knowledge Base

- **Scope**: one global, personal vault, shared across every project — not per-project. A
  concept learned on one project doesn't re-highlight on another.
- **Storage**: direct markdown file read/write against a real Obsidian vault. No dependency on
  Obsidian's Local REST API plugin, and no dependency on Obsidian actually running.
- **Shape**: one markdown note per concept.
  - Frontmatter: `status` (unlearned / learned / muted / snoozed), `learned_date`, `aliases`.
  - Graph edges are native Obsidian `[[wikilinks]]` between concept notes — this doubles as
    Obsidian's own graph view, so there's no need for a separate custom graph store.
- **Noise control**: tagging scope is user-configurable — can range from "infra/architecture
  concepts only" to "include basic language syntax," not fixed by prompt judgment alone.

## 6. Interaction Model

Two visual tiers, both clickable:

- **Unlearned/new** — prominent highlight.
- **Known/learned** — discreet, subtle marker.

**Click on an unlearned concept** opens an action menu:

- *Learn* — opens a Socratic tutor chat session on the concept. Ends when the user decides
  they're done; no quiz gate.
- *Mark known* — instant, no session. Supports cold-start (things you already know).
- *Mute* — don't ask again; explicitly **not** the same as learned. Still gets a vault note
  (`muted` status) so it isn't silently lost.
- *Snooze* — ask again later. (Resurface duration/trigger: open question, §9.)

**Click on a known concept** opens the notes view (rendered vault note) first, with actions
inside it:

- *Refresh* — start a new Socratic session on the topic.
- *Edit notes* — in-harness edit-in-place toggle directly on the rendered note. No required
  context-switch to the real Obsidian app.
- *Demote* — "actually I don't know this," explicit action distinct from editing. Flips status
  back to unlearned/highlighted.

**Code-sourced concepts** (found only in a diff, with no corresponding chat prose to underline)
surface as a rollup list attached to the turn (e.g. "Concepts touched: Kubernetes, retry
backoff"), not as an inline highlight.

**History re-render**: live. Stored messages keep concept references only; status (and
therefore which visual tier to render) is resolved against current vault state at render time,
not frozen at generation time. Marking something known/demoted changes how it displays
everywhere it's ever appeared, not just going forward.

## 7. Cold Start

- Bulk import/pre-seed pass: generate a candidate list of likely-already-known concepts for
  your stack, review/approve in bulk before everyday use.
- Plus ongoing inline "mark known" on anything newly flagged that the bulk pass missed.

## 8. Scope / Ambition

- Personal tool first, built for your own workflow.
- Extractor, graph-builder, and vault-backend are each built behind clean, swappable interfaces
  from day one, in case this gets shared/open-sourced later.

## 9. Open Questions (not yet decided)

- Socratic tutor session design: how it's scoped/seeded per concept, what signals "ready to
  mark learned."
- Embedding/vector infra specifics for concept matching (which model/library, where the index
  lives).
- Snooze duration and what resurfaces a snoozed concept (time-based? next mention?).
- Which specific model/provider is pinned for the extraction stage.
- opencode's actual plugin/event system — confirm it has a hook point suited to a fully
  separate post-processing stage; if not, what the minimal patch to add one looks like.
- UI layout specifics for rollup lists and discreet-vs-prominent highlight styling in the web UI.

## 10. Non-Goals (v1)

- No dependency on a running Obsidian instance.
- No quiz-gated learning — "learned" is self-declared via the tutor session.
- No per-project knowledge graphs — single global vault.
- No multi-user support.
