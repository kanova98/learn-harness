export * as ConceptVault from "./concept-vault"

import matter from "gray-matter"
import path from "path"
import { Context, Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "./effect/app-node"
import { Config } from "./config"
import { ConfigMarkdown } from "./config/markdown"
import { ConfigPlugin } from "./config/plugin"
import { FSUtil } from "./fs-util"

export type ConceptStatus = "unlearned" | "learned" | "muted" | "snoozed"

export type ConceptEdge = { type: "prerequisite-of" | "related-to" | "part-of"; target: string }

export type ConceptNote = {
  id: string
  status: ConceptStatus
  aliases: string[]
}

export class NotConfiguredError extends Schema.TaggedErrorClass<NotConfiguredError>()("ConceptVault.NotConfiguredError", {
  message: Schema.String,
}) {}

export const loadIndex = Effect.fn("ConceptVault.loadIndex")(function* (vaultPath: string) {
  const fsUtil = yield* FSUtil.Service
  const entries = yield* fsUtil.readDirectoryEntries(vaultPath).pipe(Effect.orElseSucceed(() => []))
  const notes: ConceptNote[] = []
  for (const entry of entries) {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue
    const raw = yield* fsUtil.readFileStringSafe(path.join(vaultPath, entry.name))
    if (raw === undefined) continue
    const parsed = ConfigMarkdown.parse(raw)
    notes.push({
      id: entry.name.slice(0, -3),
      status: toStatus(parsed.data.status),
      aliases: toAliases(parsed.data.aliases),
    })
  }
  return notes
})

export const createNote = Effect.fn("ConceptVault.createNote")(function* (
  vaultPath: string,
  note: { id: string; aliases: string[]; edges: ConceptEdge[] },
) {
  const fsUtil = yield* FSUtil.Service
  const filePath = notePath(vaultPath, note.id)
  if (yield* fsUtil.existsSafe(filePath)) return
  const body = note.edges.map((edge) => `- ${edge.type} [[${edge.target}]]`).join("\n")
  yield* fsUtil.writeWithDirs(filePath, matter.stringify(body ? `\n${body}\n` : "\n", { status: "unlearned", aliases: note.aliases }))
})

export const writeStatus = Effect.fn("ConceptVault.writeStatus")(function* (
  vaultPath: string,
  id: string,
  status: ConceptStatus,
) {
  const fsUtil = yield* FSUtil.Service
  const filePath = notePath(vaultPath, id)
  const raw = yield* fsUtil.readFileStringSafe(filePath)
  const parsed = raw === undefined ? { data: {} as Record<string, unknown>, content: "\n" } : ConfigMarkdown.parse(raw)
  parsed.data.status = status
  if (status === "learned") parsed.data.learned_date = new Date().toISOString().slice(0, 10)
  yield* fsUtil.writeWithDirs(filePath, matter.stringify(parsed.content, parsed.data))
})

function toStatus(value: unknown): ConceptStatus {
  if (value === "unlearned" || value === "learned" || value === "muted" || value === "snoozed") return value
  return "unlearned"
}

function toAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

// Obsidian uses the filename as the note title; keep it filesystem-safe without
// touching the canonical id used for alias/exact matching elsewhere.
function notePath(vaultPath: string, id: string) {
  return path.join(vaultPath, `${id.replace(/[/\\:*?"<>|]/g, "-")}.md`)
}

// The vault path lives on the concept-tagger plugin's own config options, not a
// dedicated top-level config field, so Server only ever reads what the plugin
// already reads — no new field to keep in sync across upstream config merges.
function isConceptTagger(pkg: string) {
  return (
    pkg
      .replace(/\/$/, "")
      .split("/")
      .pop() === "concept-tagger"
  )
}

export interface Interface {
  readonly setStatus: (input: { id: string; status: ConceptStatus }) => Effect.Effect<void, NotConfiguredError | FSUtil.Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/ConceptVault") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const fsUtil = yield* FSUtil.Service

    const resolveVaultPath = Effect.fn("ConceptVault.resolveVaultPath")(function* () {
      const entries = yield* config.entries()
      const plugins = Config.latest(entries, "plugins") ?? []
      const entry = plugins.find(
        (plugin): plugin is ConfigPlugin.Entry => typeof plugin !== "string" && isConceptTagger(plugin.package),
      )
      const vaultPath = entry?.options?.["vault_path"]
      return typeof vaultPath === "string" ? vaultPath : undefined
    })

    return Service.of({
      setStatus: Effect.fn("ConceptVault.Service.setStatus")(function* (input: { id: string; status: ConceptStatus }) {
        const vaultPath = yield* resolveVaultPath()
        if (!vaultPath) return yield* new NotConfiguredError({ message: "concept-tagger vault_path is not configured" })
        yield* writeStatus(vaultPath, input.id, input.status).pipe(Effect.provideService(FSUtil.Service, fsUtil))
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Config.node] })
