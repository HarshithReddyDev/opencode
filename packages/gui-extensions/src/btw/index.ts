import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

const Questions = Schema.Struct({
  questions: Schema.Array(
    Schema.Struct({ id: Schema.String, question: Schema.String, answer: Schema.optional(Schema.String) }),
  ),
})

export default Extension.define({
  id: "btw",
  stores: {
    // Each open /btw tab's question and answer, kept until its tab closes.
    questions: Store.session(Questions, { questions: [] }),
  },
  i18n: { en },
})
