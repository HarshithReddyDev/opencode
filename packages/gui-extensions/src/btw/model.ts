import { Schema } from "effect"
import { batch, createRoot, getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode/ui/toast"
import { createKeyed, type MountedSession, type Persisted, type SetupContext } from "../sdk"
import type Btw from "./index"

const QuestionHistory = Schema.Struct({
  questions: Schema.Array(
    Schema.Struct({ id: Schema.String, question: Schema.String, answer: Schema.optional(Schema.String) }),
  ),
})

const instructions = [
  "The user is asking a quick side question about the conversation so far.",
  "Answer directly and concisely in markdown from what you already know.",
  "Do not call any tools and do not take any actions.",
].join(" ")

/** Device-local one-shot side questions, independent of the main session's messages and the layout's bounded cache. */
export function createBtw(ctx: SetupContext<typeof Btw>) {
  const owner = getOwner()
  const stores = new Map<string, { saved: Persisted<typeof QuestionHistory.Type>; dispose: () => void }>()
  const controllers = new Map<string, { session: string; controller: AbortController }>()
  const [requests, setRequests] = createStore<{ pending: string[] }>({ pending: [] })

  const saved = (session: MountedSession) => {
    const existing = stores.get(session.key)

    if (existing) return existing.saved

    // Runtime keys keep each parent's history lazy. Global scope avoids losing questions when old layout
    // entries are pruned, and the stable session key keeps the history when the session moves directories.
    const entry = createRoot(
      (dispose) => ({
        saved: ctx.storage.store(`questions.${session.key}`, { schema: QuestionHistory, initial: { questions: [] } }),
        dispose,
      }),
      owner,
    )

    stores.set(session.key, entry)

    return entry.saved
  }

  const stop = (id: string) => {
    controllers.get(id)?.controller.abort()
    controllers.delete(id)
    setRequests("pending", (list) => list.filter((item) => item !== id))
  }

  // Leaving a parent abandons its requests, but switching side tabs does not. Unanswered questions remain retryable.
  createKeyed(
    () => ctx.sessions.current()?.key,
    (key) => onCleanup(() => controllers.forEach((request, id) => request.session === key && stop(id))),
  )

  // Release storage subscriptions when a parent no longer has a shell tab. The history itself stays on disk.
  createKeyed(
    () => [...ctx.sessions.list().map((session) => session.key), ctx.sessions.current()?.key].join("\u0000"),
    () => {
      const keep = new Set([...ctx.sessions.list().map((session) => session.key), ctx.sessions.current()?.key])
      stores.forEach((entry, key) => {
        if (keep.has(key)) return
        entry.dispose()
        stores.delete(key)
      })
    },
  )
  onCleanup(() => {
    Array.from(controllers.keys()).forEach(stop)
    stores.forEach((entry) => entry.dispose())
  })

  const questions = (session: MountedSession) => saved(session).value?.questions ?? []
  const question = (session: MountedSession, id: string) => questions(session).find((item) => item.id === id)
  const pending = (id: string) => requests.pending.includes(id)

  const error = (session: MountedSession, id: string) => {
    const item = question(session, id)

    return !!item && item.answer === undefined && !pending(id)
  }

  const generate = (session: MountedSession, id: string) => {
    const item = question(session, id)

    if (!item || pending(id)) return

    const store = saved(session)
    const controller = new AbortController()
    controllers.set(id, { session: session.key, controller })
    setRequests("pending", (list) => [...list, id])

    return (
      session.server.client.session
        .generate(
          { sessionID: session.id, prompt: [instructions, item.question].join("\n\n") },
          { signal: controller.signal },
        )
        .then((result) => {
          if (ctx.signal.aborted || controller.signal.aborted) return
          store.update((draft) => {
            const question = draft.questions.find((item) => item.id === id)

            if (question) question.answer = result.text.trim()
          })
        })
        // A missing answer is the durable retry state; no transient spinner or error flag is stored.
        .catch(() => undefined)
        .finally(() => {
          if (controllers.get(id)?.controller === controller) stop(id)
        })
    )
  }

  const ask = (value?: string) => {
    const question = value?.trim()

    if (!question) {
      showToast({ title: ctx.t("question.required") })

      return
    }

    const session = ctx.sessions.current()

    if (!session) return

    const store = saved(session)
    const id = crypto.randomUUID()

    // Storage writes wait for desktop hydration. Start generation only after the new record is visible, under a
    // short-lived owner; navigating away or disabling the extension cancels the waiting request too.
    return new Promise<void>((resolve) => {
      const controller = new AbortController()
      const signal = AbortSignal.any([controller.signal, ctx.signal])
      createRoot((dispose) => {
        const done = () => {
          signal.removeEventListener("abort", done)
          dispose()
          resolve()
        }

        signal.addEventListener("abort", done, { once: true })
        createKeyed(
          () => ctx.sessions.current()?.key === session.key,
          () => onCleanup(() => controller.abort()),
        )
        createKeyed(
          () => store.ready(),
          () => {
            if (signal.aborted) return
            batch(() => {
              store.update((draft) => {
                draft.questions.push({ id, question })
              })
              ctx.layout.open(`${ctx.id}:${id}`, session, { tab: "select" })
            })
            // Release the main composer once the side request starts, not when its answer arrives.
            void generate(session, id)
            done()
          },
        )
      }, owner)
    })
  }

  return {
    ask,
    saved,
    questions,
    question,
    pending,
    error,
    stop,
    open: (session: MountedSession, id: string) => ctx.layout.open(`${ctx.id}:${id}`, session, { tab: "select" }),
    retry: generate,
  }
}

export type BtwModel = ReturnType<typeof createBtw>
