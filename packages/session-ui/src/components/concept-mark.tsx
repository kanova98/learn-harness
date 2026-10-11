import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { Show } from "solid-js"
import { render } from "solid-js/web"
import "./concept-mark.css"

export type ConceptMarkLabels = {
  learn: string
  markKnown: string
  mute: string
  snooze: string
  refresh: string
  editNotes: string
  demote: string
  label: (name: string) => string
}

type ConceptMarkProps = {
  id: string
  status: string
  tier: "new" | "known"
  text: string
  labels: ConceptMarkLabels
}

// There's no app<->vault bridge yet (concept-tagger's vault lives in the plugin process).
// These actions are UI-only placeholders until that write path exists.
function stubConceptAction(action: string, id: string) {
  console.info(`[concept-tagger] "${action}" is not wired up yet for "${id}"`)
}

function ConceptMark(props: ConceptMarkProps) {
  return (
    <MenuV2 placement="bottom-start" gutter={4}>
      <MenuV2.Trigger
        as="span"
        data-component="concept-mark"
        data-concept-tier={props.tier}
        data-concept-status={props.status}
        aria-label={props.labels.label(props.id)}
      >
        {props.text}
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content>
          <Show
            when={props.tier === "new"}
            fallback={
              <>
                <MenuV2.Item onSelect={() => stubConceptAction("refresh", props.id)}>{props.labels.refresh}</MenuV2.Item>
                <MenuV2.Item onSelect={() => stubConceptAction("editNotes", props.id)}>{props.labels.editNotes}</MenuV2.Item>
                <MenuV2.Item onSelect={() => stubConceptAction("demote", props.id)}>{props.labels.demote}</MenuV2.Item>
              </>
            }
          >
            <MenuV2.Item onSelect={() => stubConceptAction("learn", props.id)}>{props.labels.learn}</MenuV2.Item>
            <MenuV2.Item onSelect={() => stubConceptAction("markKnown", props.id)}>{props.labels.markKnown}</MenuV2.Item>
            <MenuV2.Item onSelect={() => stubConceptAction("mute", props.id)}>{props.labels.mute}</MenuV2.Item>
            <MenuV2.Item onSelect={() => stubConceptAction("snooze", props.id)}>{props.labels.snooze}</MenuV2.Item>
          </Show>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}

const conceptMarkState = new WeakMap<HTMLElement, { dispose: () => void }>()

function mountConceptMark(props: ConceptMarkProps) {
  const host = document.createElement("span")
  host.setAttribute("data-slot", "concept-mark-host")
  host.style.display = "contents"
  const dispose = render(() => <ConceptMark {...props} />, host)
  conceptMarkState.set(host, { dispose })
  return host
}

export function markConcepts(root: HTMLDivElement, labels: ConceptMarkLabels) {
  const marks = Array.from(root.querySelectorAll<HTMLElement>('[data-component="concept-mark"]'))
  for (const mark of marks) {
    const id = mark.dataset.conceptId
    const status = mark.dataset.conceptStatus
    const tier = mark.dataset.conceptTier
    if (!id || !status || (tier !== "new" && tier !== "known")) continue
    const host = mountConceptMark({ id, status, tier, text: mark.textContent ?? "", labels })
    mark.replaceWith(host)
  }
}

export function disposeConceptMarks(root: Element) {
  const hosts = [
    ...(root instanceof HTMLElement && root.getAttribute("data-slot") === "concept-mark-host" ? [root] : []),
    ...Array.from(root.querySelectorAll('[data-slot="concept-mark-host"]')).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    ),
  ]
  hosts.forEach((host) => {
    conceptMarkState.get(host)?.dispose()
    conceptMarkState.delete(host)
  })
}
