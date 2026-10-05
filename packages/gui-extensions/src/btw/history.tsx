import { Dialog, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { List } from "@opencode/ui/list"
import { Show } from "solid-js"
import { useExtension, type DialogHandle, type MountedSession } from "../sdk"
import type { BtwModel } from "./model"

export default function SideQuestionHistory(props: { btw: BtwModel; session: MountedSession; dialog: DialogHandle }) {
  const ctx = useExtension()

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup title={ctx.t("history.title")} />
      </DialogHeader>
      <Show
        when={props.btw.saved(props.session).ready()}
        fallback={
          <div role="status" class="px-5 py-4 text-13-regular text-text-weak">
            {ctx.t("history.loading")}
          </div>
        }
      >
        <List
          items={() => [...props.btw.questions(props.session)].reverse()}
          key={(item) => item.id}
          filterKeys={["question"]}
          search={{ placeholder: ctx.t("history.search"), autofocus: true }}
          emptyMessage={ctx.t("history.empty")}
          onSelect={(item) => {
            if (!item) return
            props.btw.open(props.session, item.id)
            props.dialog.close()
          }}
        >
          {(item) => <span class="min-w-0 truncate">{item.question}</span>}
        </List>
      </Show>
    </Dialog>
  )
}
