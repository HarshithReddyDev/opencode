import { createMemo, createSignal, on, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { ScrollView } from "@opencode/ui/scroll-view"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Tooltip } from "@opencode/ui/tooltip"
import { showToast } from "@opencode/ui/toast"
import { Markdown } from "@opencode/session-ui/markdown"
import { useExtension, type MountedSession } from "../sdk"
import type { BtwModel } from "./model"

export default function SessionBtwPanel(props: {
  btw: BtwModel
  session: MountedSession
  id: string
  history: () => void
}) {
  const ctx = useExtension()
  const question = () => props.btw.question(props.session, props.id)
  const answer = () => question()?.answer
  const shown = createMemo(on(answer, () => ({})))
  const [copiedAnswer, setCopiedAnswer] = createSignal<object>()
  const copied = () => copiedAnswer() === shown()

  const copy = () => {
    const value = answer()

    if (!value) return
    const token = shown()
    void ctx.system.copy(value).then(
      () => setCopiedAnswer(token),
      () => showToast({ title: ctx.t("common.requestFailed") }),
    )
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-v2-background-bg-base" data-slot="session-btw-panel">
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base px-5 py-3">
        <div class="min-w-0 text-13-regular text-text-weak">{ctx.t("tab.title")}</div>
        <div class="flex shrink-0 items-center gap-1">
          <Tooltip value={ctx.t("history.title")}>
            <IconButton
              size="small"
              variant="ghost-muted"
              icon={<Icon name="bubble-5" />}
              aria-label={ctx.t("history.title")}
              onClick={props.history}
            />
          </Tooltip>
          <Show when={answer()}>
            <Tooltip value={copied() ? ctx.t("common.copied") : ctx.t("copy")}>
              <IconButton
                size="small"
                variant="ghost-muted"
                icon={<Icon name={copied() ? "check" : "outline-copy"} />}
                aria-label={copied() ? ctx.t("common.copied") : ctx.t("copy")}
                onClick={copy}
              />
            </Tooltip>
          </Show>
        </div>
      </div>

      <div class="relative min-h-0 flex-1">
        <ScrollView class="absolute inset-0">
          <div class="flex min-w-0 flex-col gap-4 px-5 py-4 pb-8">
            <div class="whitespace-pre-wrap break-words text-13-regular text-text-weak">{question()?.question}</div>
            <Show when={props.btw.pending(props.id)}>
              <div role="status" class="flex h-9 items-center text-[13px] font-[530] leading-text-compact">
                <TextShimmer text={ctx.t("session.timeline.working")} active />
              </div>
            </Show>
            <Show when={props.btw.error(props.session, props.id)}>
              <div class="flex flex-col items-start gap-3">
                <div class="text-13-regular text-text-weak">{ctx.t("error")}</div>
                <Button size="small" variant="outline" onClick={() => props.btw.retry(props.session, props.id)}>
                  {ctx.t("retry")}
                </Button>
              </div>
            </Show>
            <Show when={answer() !== undefined}>
              <Markdown text={answer() ?? ""} class="text-14-regular" />
            </Show>
          </div>
        </ScrollView>
      </div>
    </div>
  )
}
