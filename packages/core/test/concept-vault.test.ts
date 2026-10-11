import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConceptVault } from "@opencode-ai/core/concept-vault"
import { Config } from "@opencode-ai/core/config"
import { ConfigPlugin } from "@opencode-ai/core/config/plugin"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { it } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const fsLayer = AppNodeBuilder.build(FSUtil.node)

const withTmpdir = <A, E, R>(body: (vaultPath: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => body(tmp.path),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const vaultLayer = (plugins: Config.Info["plugins"]) =>
  AppNodeBuilder.build(LayerNode.group([ConceptVault.node, FSUtil.node]), [
    [
      Config.node,
      Layer.succeed(
        Config.Service,
        Config.Service.of({
          entries: () => Effect.succeed([new Config.Document({ type: "document", info: new Config.Info({ plugins }) })]),
        }),
      ),
    ],
  ])

describe("ConceptVault", () => {
  it.effect("loads an empty index for a missing vault directory", () =>
    withTmpdir((dir) => Effect.gen(function* () {
      expect(yield* ConceptVault.loadIndex(`${dir}/missing`)).toEqual([])
    })).pipe(Effect.provide(fsLayer)),
  )

  it.effect("creates a note and loads it back with its aliases and status", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* ConceptVault.createNote(dir, {
          id: "Kubernetes",
          aliases: ["k8s"],
          edges: [{ type: "part-of", target: "Container Orchestration" }],
        })
        expect(yield* ConceptVault.loadIndex(dir)).toEqual([
          { id: "Kubernetes", status: "unlearned", aliases: ["k8s"] },
        ])
      }),
    ).pipe(Effect.provide(fsLayer)),
  )

  it.effect("does not overwrite an existing note", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* ConceptVault.createNote(dir, { id: "Kubernetes", aliases: ["k8s"], edges: [] })
        yield* ConceptVault.writeStatus(dir, "Kubernetes", "learned")
        yield* ConceptVault.createNote(dir, { id: "Kubernetes", aliases: ["should-not-apply"], edges: [] })
        expect(yield* ConceptVault.loadIndex(dir)).toEqual([
          { id: "Kubernetes", status: "learned", aliases: ["k8s"] },
        ])
      }),
    ).pipe(Effect.provide(fsLayer)),
  )

  it.effect("writeStatus updates status and stamps learned_date", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* ConceptVault.createNote(dir, { id: "Kubernetes", aliases: [], edges: [] })
        yield* ConceptVault.writeStatus(dir, "Kubernetes", "learned")
        const [note] = yield* ConceptVault.loadIndex(dir)
        expect(note?.status).toBe("learned")
      }),
    ).pipe(Effect.provide(fsLayer)),
  )

  it.effect("writeStatus creates a note on the fly when one doesn't exist yet", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* ConceptVault.writeStatus(dir, "Kubernetes", "muted")
        expect(yield* ConceptVault.loadIndex(dir)).toEqual([{ id: "Kubernetes", status: "muted", aliases: [] }])
      }),
    ).pipe(Effect.provide(fsLayer)),
  )

  it.effect("Service.setStatus resolves vault_path from the concept-tagger plugin entry", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* ConceptVault.createNote(dir, { id: "Kubernetes", aliases: [], edges: [] })
        const vault = yield* ConceptVault.Service
        yield* vault.setStatus({ id: "Kubernetes", status: "learned" })
        const [note] = yield* ConceptVault.loadIndex(dir)
        expect(note?.status).toBe("learned")
      }).pipe(
        Effect.provide(
          vaultLayer([new ConfigPlugin.Entry({ package: "../packages/concept-tagger", options: { vault_path: dir } })]),
        ),
      ),
    ),
  )

  it.effect("Service.setStatus fails when no concept-tagger plugin entry is configured", () =>
    Effect.gen(function* () {
      const vault = yield* ConceptVault.Service
      const result = yield* vault.setStatus({ id: "Kubernetes", status: "learned" }).pipe(Effect.flip)
      expect(result._tag).toBe("ConceptVault.NotConfiguredError")
    }).pipe(Effect.provide(vaultLayer(["some-other-plugin"]))),
  )
})
