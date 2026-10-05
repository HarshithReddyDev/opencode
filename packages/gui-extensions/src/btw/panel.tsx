import { createMemo, createSignal, For, on, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { createAutoScroll } from "@opencode/ui/hooks"
import { ScrollView } from "@opencode/ui/scroll-view"
import { TextField } from "@opencode/ui/text-field"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Tooltip } from "@opencode/ui/tooltip"
import { showToast } from "@opencode/ui/toast"
import { Markdown } from "@opencode/session-ui/markdown"
import { createKeyed, useExtension, type MountedSession } from "../sdk"
import type { BtwModel } from "./model"

export default function SessionBtwPanel(props: {
  btw: BtwModel
  session: MountedSession
  id: string
  history: () => void
}) {
  const ctx = useExtension()
  const conversation = () => props.btw.conversation(props.session, props.id)
  const answer = () => conversation()?.exchanges.at(-1)?.answer
  const shown = createMemo(on(answer, () => ({})))
  const [copiedAnswer, setCopiedAnswer] = createSignal<object>()
  const copied = () => copiedAnswer() === shown()
  const pending = () => props.btw.pending(props.id)
  const error = () => props.btw.error(props.session, props.id)
  const canSend = () => !!conversation()?.draft.trim() && !pending() && !error()
  const scroll = createAutoScroll({ working: pending })

  // A selected conversation opens at its latest exchange; ordinary scrolling upwards pauses auto-follow.
  createKeyed(
    () => props.id,
    () => scroll.resume(),
  )

  const send = () => {
    if (!canSend()) return
    void props.btw.followUp(props.session, props.id)
    scroll.resume()
  }

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
        <div class="min-w-0 truncate text-13-regular text-text-weak">{ctx.t("tab.title")}</div>
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
        <ScrollView class="absolute inset-0" viewportRef={scroll.scrollRef} onScroll={scroll.handleScroll}>
          <div ref={scroll.contentRef} class="flex flex-col gap-5 px-5 py-4 pb-8">
            <For each={conversation()?.exchanges}>
              {(exchange) => (
                <div class="flex min-w-0 flex-col gap-3">
                  <div class="whitespace-pre-wrap break-words text-13-regular text-text-weak">{exchange.question}</div>
                  <Show when={exchange.answer !== undefined}>
                    <Markdown text={exchange.answer ?? ""} class="text-14-regular" />
                  </Show>
                </div>
              )}
            </For>
            <Show when={pending()}>
              <div role="status" class="flex h-9 items-center text-[13px] font-[530] leading-text-compact">
                <TextShimmer text={ctx.t("session.timeline.working")} active />
              </div>
            </Show>
            <Show when={error()}>
              <div class="flex flex-col items-start gap-3">
                <div class="text-13-regular text-text-weak">{ctx.t("error")}</div>
                <Button
                  size="small"
                  variant="outline"
                  onClick={() => {
                    void props.btw.retry(props.session, props.id)
                    scroll.resume()
                  }}
                >
                  {ctx.t("retry")}
                </Button>
              </div>
            </Show>
          </div>
        </ScrollView>
      </div>

      <form
        class="flex shrink-0 items-end gap-2 border-t border-v2-border-border-base p-3"
        onSubmit={(event) => {
          event.preventDefault()

          send()
        }}
      >
        <div class="min-w-0 flex-1">
          <TextField
            class="max-h-40 min-h-10 resize-none"
            multiline
            label={ctx.t("followUp.label")}
            hideLabel
            placeholder={ctx.t("followUp.placeholder")}
            value={conversation()?.draft ?? ""}
            disabled={!conversation()}
            onChange={(value) => props.btw.draft(props.session, props.id, value)}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return
              event.preventDefault()

              send()
            }}
          />
        </div>
        <Button type="submit" size="small" variant="submit" disabled={!canSend()}>
          {ctx.t("followUp.send")}
        </Button>
      </form>
    </div>
  )
}
