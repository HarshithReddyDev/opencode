export * as ReadOutput from "./read-output.js"

import { Option, Schema } from "effect"
import { FileSystem } from "./filesystem.js"
import { PositiveInt, RelativePath } from "./schema.js"

export const FileContent = Schema.Struct({
  type: Schema.Literal("file"),
  ...FileSystem.Content.fields,
}).annotate({ identifier: "ReadTool.FileContent" })
export type FileContent = typeof FileContent.Type

export class TextPage extends Schema.Class<TextPage>("ReadTool.TextPage")({
  type: Schema.Literal("text-page"),
  content: Schema.String,
  mime: Schema.String,
  offset: PositiveInt,
  truncated: Schema.Boolean,
  next: Schema.optionalKey(PositiveInt),
}) {}

export interface ListEntry extends Schema.Schema.Type<typeof ListEntry> {}
export const ListEntry = Schema.Struct({
  path: RelativePath,
  type: Schema.Literals(["file", "directory", "symlink"]),
}).annotate({ identifier: "ReadTool.ListEntry" })

export class ListPage extends Schema.Class<ListPage>("ReadTool.ListPage")({
  type: Schema.Literal("list-page"),
  entries: Schema.Array(ListEntry),
  truncated: Schema.Boolean,
  next: Schema.optionalKey(PositiveInt),
}) {}

export const Output = Schema.Union([FileContent, TextPage, ListPage])

const decodeOutput = Schema.decodeUnknownOption(Schema.fromJsonString(Output))

export function displayText(text: string) {
  if (!text.startsWith("{")) return undefined
  const output = decodeOutput(text)
  if (Option.isNone(output)) return undefined
  if (output.value.type === "list-page") return output.value.entries.map((entry) => entry.path).join("\n")
  if (output.value.type === "file" && output.value.encoding === "base64") return undefined
  return output.value.content
}
