import { Show, createMemo } from "solid-js"
import type { Session } from "../types/session"
import { useI18n } from "../lib/i18n"

interface GoalState {
  text?: string
  status?: "running" | "paused" | "done" | "failed"
  steps?: number
  maxSteps?: number
}

const goalStatusLabel = (status: GoalState["status"], t: (key: string) => string) => {
  switch (status) {
    case "running":
      return t("goalStatus.running")
    case "done":
      return t("goalStatus.done")
    case "failed":
      return t("goalStatus.failed")
    case "paused":
      return t("goalStatus.paused")
    default:
      return ""
  }
}

export default function GoalStatus(props: { session: Session }) {
  const { t } = useI18n()

  const goal = createMemo<GoalState | null>(() => {
    const raw = props.session.metadata?.goal
    if (!raw || typeof raw !== "object") return null
    return raw as GoalState
  })

  const state = createMemo(() => (props.session.agent === "goal" ? goal() : null))

  return (
    <Show when={state()} fallback={null}>
      {(current) => (
        <div class="sidebar-selector">
          <div class="goal-status-card">
            <div class="goal-status-header">
              <span class="goal-status-title">{t("goalStatus.title")}</span>
              <span class={`goal-status-badge goal-status-badge--${current().status ?? "running"}`}>
                {goalStatusLabel(current().status, t)}
              </span>
            </div>
            <div class="goal-status-text">{current().text}</div>
            <Show when={current().status === "running"}>
              <div class="goal-status-steps">
                {t("goalStatus.steps", { current: current().steps ?? 0, max: current().maxSteps ?? 0 })}
              </div>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
