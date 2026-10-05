import { Dialog, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { List } from "@opencode/ui/list"
import { useExtension, type DialogHandle, type MountedSession } from "../sdk"
import type { BtwModel } from "./model"

export default function SideConversationHistory(props: {
  btw: BtwModel
  session: MountedSession
  dialog: DialogHandle
}) {
  const ctx = useExtension()

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitleGroup title={ctx.t("history.title")} />
      </DialogHeader>
      <List
        items={() => [...props.btw.conversations(props.session)].reverse()}
        key={(item) => item.id}
        filterKeys={["title"]}
        search={{ placeholder: ctx.t("history.search"), autofocus: true }}
        emptyMessage={ctx.t("history.empty")}
        onSelect={(item) => {
          if (!item) return
          props.btw.open(props.session, item.id)
          props.dialog.close()
        }}
      >
        {(item) => <span class="min-w-0 truncate">{item.title}</span>}
      </List>
    </Dialog>
  )
}
