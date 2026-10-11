import katex from "katex"
import { Marked, type MarkedExtension, type Tokens } from "marked"
import markedShiki from "marked-shiki"

export function createMarkdownParser(highlight: (code: string, language: string) => string | Promise<string>) {
  return new Marked(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    katexExtension,
    conceptMarkExtension,
    markedShiki({ highlight }),
  )
}

const inlineMathRegex = /^\\\(((?:\\.|[^\\\n])*?)\\\)/
const blockMathRegex = /^\$\$\n([\s\S]+?)\n\$\$(?:\n|$)/

const katexExtension: MarkedExtension = {
  extensions: [
    {
      name: "inlineKatex",
      level: "inline",
      start(src) {
        const index = src.indexOf("\\(")
        if (index === -1) return
        return index
      },
      tokenizer(src) {
        const match = src.match(inlineMathRegex)
        if (!match) return
        return {
          type: "inlineKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: false,
        }
      },
      renderer: renderKatexToken,
    },
    {
      name: "blockKatex",
      level: "block",
      tokenizer(src) {
        const match = src.match(blockMathRegex)
        if (!match) return
        return {
          type: "blockKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: true,
        }
      },
      renderer: renderKatexToken,
    },
  ],
}

function renderKatexToken(token: Tokens.Generic) {
  return katex.renderToString(typeof token.text === "string" ? token.text : "", {
    displayMode: token.displayMode === true,
    throwOnError: false,
  })
}

// Written by packages/concept-tagger as [[concept:<vault id>:<status>]]<surface text>[[/concept]].
// "muted" concepts render as plain text: muting means "stop highlighting this", not "hide status".
const conceptMarkRegex = /^\[\[concept:([^:\]]+):(unlearned|learned|muted|snoozed)\]\]([\s\S]*?)\[\[\/concept\]\]/
const conceptMarkTiers: Record<string, "new" | "known" | undefined> = {
  unlearned: "new",
  snoozed: "new",
  learned: "known",
}

const conceptMarkExtension: MarkedExtension = {
  extensions: [
    {
      name: "conceptMark",
      level: "inline",
      start(src) {
        const index = src.indexOf("[[concept:")
        if (index === -1) return
        return index
      },
      tokenizer(src) {
        const match = src.match(conceptMarkRegex)
        if (!match) return
        return {
          type: "conceptMark",
          raw: match[0],
          id: match[1],
          status: match[2],
          text: match[3],
        }
      },
      renderer: renderConceptMarkToken,
    },
  ],
}

function renderConceptMarkToken(token: Tokens.Generic) {
  const id = typeof token.id === "string" ? token.id : ""
  const status = typeof token.status === "string" ? token.status : ""
  const text = typeof token.text === "string" ? token.text : ""
  const tier = conceptMarkTiers[status]
  if (!tier) return escapeHtml(text)
  return `<span data-component="concept-mark" data-concept-tier="${tier}" data-concept-id="${escapeAttr(id)}" data-concept-status="${escapeAttr(status)}">${escapeHtml(text)}</span>`
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(text: string) {
  return escapeHtml(text).replace(/"/g, "&quot;")
}
