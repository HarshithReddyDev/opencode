import { expect, test } from "@playwright/test"
import { sessionHref } from "../utils/app"
import { openSession } from "../utils/workspace"
import { expectSessionTitle } from "../utils/waits"

test.use({ viewport: { width: 1440, height: 900 }, video: "off" })

test("keeps separate /btw conversations and restores them after reload", async ({ page }, testInfo) => {
  const prompts: unknown[] = []
  const generations: { sessionID: string; prompt: string }[] = []

  const { editor } = await openSession(page, {
    name: "BtwConversations",
    onPrompt: (input) => prompts.push(input),
    generate: (input) => {
      generations.push(input)

      return {
        text: input.prompt.includes("second question")
          ? "Second answer"
          : input.prompt.includes("follow up")
            ? "First follow-up answer"
            : `First answer\n\n${"A detailed explanation of the first question.\n\n".repeat(100)}End of first answer`,
      }
    },
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  await editor.fill("/btw first question")
  await editor.press("Enter")
  await expect(panel.getByText("First answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("End of first answer", { exact: true })).toBeInViewport()
  await editor.fill("/btw second question")
  await editor.press("Enter")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  const first = page.getByRole("tab", { name: "first question", exact: true })
  const second = page.getByRole("tab", { name: "second question", exact: true })
  await expect(first).toBeVisible()
  await expect(second).toHaveAttribute("data-selected", "")
  await page.screenshot({ path: testInfo.outputPath("separate-tabs.png") })
  await first.click()
  const input = panel.getByRole("textbox", { name: "Side conversation message" })
  await expect(input).toBeEditable()
  await input.fill("follow up")
  await input.press("Enter")
  await expect(panel.getByText("First follow-up answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("First follow-up answer", { exact: true })).toBeInViewport()
  await expect(input).toBeFocused()
  expect(generations).toHaveLength(3)
  expect(generations[2]?.prompt).toContain("First answer")
  expect(generations[2]?.prompt).not.toContain("second question")
  expect(generations[2]?.prompt).not.toContain("Second answer")
  await input.fill("Unsent draft")
  await second.click()

  await page.reload()
  await expect(page.getByRole("tab", { name: "first question", exact: true })).toBeVisible()
  await expect(page.getByRole("tab", { name: "second question", exact: true })).toHaveAttribute("data-selected", "")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "first question", exact: true }).click()
  await expect(panel.getByText("First answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("First follow-up answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("Second answer", { exact: true })).toHaveCount(0)
  await expect(input).toHaveValue("Unsent draft")
  await expect(panel.getByText("First follow-up answer", { exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath("restored-conversation.png") })

  // Closing only hides the tab; reopening a saved conversation does not make another model request.
  await first.click({ button: "middle" })
  await expect(first).toHaveCount(0)
  await panel.getByRole("button", { name: "Open side conversation", exact: true }).click()
  const history = page.getByRole("dialog", { name: "Open side conversation", exact: true })
  await expect(history.getByRole("textbox")).toBeFocused()
  await history.getByRole("textbox").fill("first question")
  await expect(history.getByText("second question", { exact: true })).toHaveCount(0)
  await expect(history.getByText("first question", { exact: true })).toBeVisible()
  await history.getByRole("textbox").press("Enter")
  await expect(history).toHaveCount(0)
  await expect(first).toHaveAttribute("data-selected", "")
  await expect(panel.getByText("First follow-up answer", { exact: true })).toBeVisible()
  await expect(input).toHaveValue("Unsent draft")
  expect(generations).toHaveLength(3)
  expect(prompts).toEqual([])
})

test("isolates concurrent side requests and makes an interrupted reload retryable", async ({ page }) => {
  const held = Promise.withResolvers<void>()
  const attempts: string[] = []
  const prompts: unknown[] = []

  const { editor } = await openSession(page, {
    name: "BtwConcurrent",
    onPrompt: (input) => prompts.push(input),
    generate: async (input) => {
      attempts.push(input.prompt)

      if (input.prompt.includes("slow question") && attempts.length === 1) {
        await held.promise

        return { text: "Abandoned answer" }
      }

      return { text: input.prompt.includes("fast question") ? "Fast answer" : "Retried answer" }
    },
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  await editor.fill("/btw slow question")
  await editor.press("Enter")
  await expect(panel.getByRole("status")).toContainText("Working")
  await editor.fill("/btw fast question")
  await editor.press("Enter")
  await expect(panel.getByText("Fast answer", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "slow question", exact: true }).click()
  await expect(panel.getByRole("status")).toContainText("Working")
  await expect(panel.getByText("Fast answer", { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(panel.getByText("Couldn’t answer that question", { exact: true })).toBeVisible()
  await expect(panel.getByRole("status")).toHaveCount(0)
  expect(attempts).toHaveLength(2)
  await panel.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(panel.getByText("Retried answer", { exact: true })).toBeVisible()
  expect(attempts).toHaveLength(3)
  expect(attempts[2]).toContain("slow question")
  expect(attempts[2]).not.toContain("fast question")
  held.resolve()
  await page.getByRole("tab", { name: "fast question", exact: true }).click()
  await expect(panel.getByText("Fast answer", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "slow question", exact: true }).click()
  await expect(panel.getByText("Retried answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("Abandoned answer", { exact: true })).toHaveCount(0)
  expect(prompts).toEqual([])
})

test("shares saved side histories across windows on the same device", async ({ page, context }) => {
  const config = {
    name: "BtwWindows",
    sessions: [
      { id: "ses_btw_shared", title: "BtwWindows" },
      { id: "ses_btw_other", title: "Other parent" },
    ],
    generate: () => ({ text: "Saved answer" }),
  }

  const first = await openSession(page, config)
  const panel = page.locator('[data-slot="session-btw-panel"]')
  await first.editor.fill("/btw first window")
  await first.editor.press("Enter")
  await expect(panel.getByText("Saved answer", { exact: true })).toBeVisible()

  const other = await context.newPage()
  const second = await openSession(other, config)
  await second.editor.fill("/btw second window")
  await second.editor.press("Enter")
  await expect(
    other.locator('[data-slot="session-btw-panel"]').getByText("Saved answer", { exact: true }),
  ).toBeVisible()
  await panel.getByRole("button", { name: "Open side conversation", exact: true }).click()
  const history = page.getByRole("dialog", { name: "Open side conversation", exact: true })
  await expect(history.getByText("second window", { exact: true })).toBeVisible()
  await history.getByRole("button", { name: "Close", exact: true }).click()
  await other.locator(`[data-titlebar-tab-link][href="${sessionHref("ses_btw_other")}"]`).click()
  await expectSessionTitle(other, "Other parent")
  await first.editor.fill("/btw question while the other window is elsewhere")
  await first.editor.press("Enter")
  await expect(panel.getByText("Saved answer", { exact: true })).toBeVisible()
  await other.locator(`[data-titlebar-tab-link][href="${sessionHref("ses_btw_shared")}"]`).click()
  await expectSessionTitle(other, "BtwWindows")
  await panel.getByRole("textbox", { name: "Side conversation message" }).fill("Draft from the first window")
  await other.reload()
  await second.editor.fill("/btw third window question")
  await second.editor.press("Enter")
  await expect(
    other.locator('[data-slot="session-btw-panel"]').getByText("Saved answer", { exact: true }),
  ).toBeVisible()
  await other
    .locator('[data-slot="session-btw-panel"]')
    .getByRole("button", { name: "Open side conversation", exact: true })
    .click()
  const reopened = other.getByRole("dialog", { name: "Open side conversation", exact: true })
  await expect(reopened.getByText("first window", { exact: true })).toBeVisible()
  await expect(reopened.getByText("second window", { exact: true })).toBeVisible()
  await expect(reopened.getByText("third window question", { exact: true })).toBeVisible()
  await expect(reopened.getByText("question while the other window is elsewhere", { exact: true })).toBeVisible()
  await reopened.getByText("question while the other window is elsewhere", { exact: true }).click()
  await expect(
    other.locator('[data-slot="session-btw-panel"]').getByRole("textbox", { name: "Side conversation message" }),
  ).toHaveValue("Draft from the first window")
  await other
    .locator('[data-slot="session-btw-panel"]')
    .getByRole("button", { name: "Open side conversation", exact: true })
    .click()
  await reopened.getByText("first window", { exact: true }).click()
  await expect(
    other.locator('[data-slot="session-btw-panel"]').getByRole("textbox", { name: "Side conversation message" }),
  ).toHaveValue("")
})

test("keeps many long-titled side tabs usable at a narrow desktop width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 700 })

  const { editor } = await openSession(page, {
    name: "BtwOverflow",
    generate: () => ({ text: "Saved overflow answer" }),
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  const questions = Array.from({ length: 12 }, (_, index) => `Side ${index + 1}: ${"long-title-".repeat(30)}`)

  for (const question of questions) {
    await editor.fill(`/btw ${question}`)
    await editor.press("Enter")
    await expect(page.getByRole("tab", { name: question, exact: true })).toHaveAttribute("data-selected", "")
    await expect(panel.getByText("Saved overflow answer", { exact: true })).toBeVisible()
  }

  await expect(page.getByRole("tab", { name: /^Side \d+:/ })).toHaveCount(12)
  const input = panel.getByRole("textbox", { name: "Side conversation message" })
  await input.fill("A narrow-layout draft")
  await expect(input).toBeInViewport()
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeInViewport()
  await page.reload()
  await expect(page.getByRole("tab", { name: /^Side \d+:/ })).toHaveCount(12)
  await expect(input).toHaveValue("A narrow-layout draft")
  await page.screenshot({ path: testInfo.outputPath("narrow-many-tabs.png") })
})

test("answers /btw in the side panel without admitting a prompt", async ({ page }) => {
  const generations: { sessionID: string; prompt: string }[] = []
  const prompts: unknown[] = []
  const generated = Promise.withResolvers<void>()
  const abandoned = Promise.withResolvers<void>()
  const main = { id: "ses_btw_sidebar", title: "Side question session" }
  const other = { id: "ses_btw_sidebar_other", title: "Other side question session" }
  const ownerWarnings: string[] = []
  page.on("console", (message) => {
    if (message.text().includes("computations created outside a `createRoot` or `render`"))
      ownerWarnings.push(message.text())
  })

  const { editor } = await openSession(page, {
    name: "BtwSidebar",
    sessions: [main, other],
    onPrompt: (input) => prompts.push(input),
    generate: async (input) => {
      generations.push(input)

      if (input.sessionID === other.id) return { text: "This answer belongs to the **other session**." }

      if (input.prompt.includes("left behind")) {
        await abandoned.promise

        return { text: "This answer arrived after the user left." }
      }

      await generated.promise

      return {
        text: "The retry loop uses **exponential backoff** and stops after three attempts.\n\n```ts\nconst delay = 2 ** attempt\n```",
      }
    },
  })

  await editor.fill("/btw")
  const suggestion = page.locator('[data-suggestion-id="btw.ask"]')
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(editor).toHaveText("/btw ")
  await editor.press("Enter")

  const panel = page.locator('[data-slot="session-btw-panel"]')
  await expect(panel).toBeHidden()
  await expect(page.getByText("Add a question after /btw", { exact: true })).toBeVisible()
  expect(generations).toEqual([])
  expect(prompts).toEqual([])

  await editor.fill("/btw how does the retry loop work?")
  await editor.press("Enter")
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Side conversation message" })).toBeEditable()
  await expect(panel.getByRole("status")).toContainText("Working")
  await expect(page.getByRole("tab", { name: "how does the retry loop work?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  generated.resolve()
  await expect(panel.getByText("how does the retry loop work?", { exact: true })).toBeVisible()
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await expect(panel.getByText("const delay = 2 ** attempt", { exact: true })).toBeVisible()
  expect(generations).toHaveLength(1)
  expect(generations[0]?.sessionID).toBe(main.id)
  expect(generations[0]?.prompt).toContain("how does the retry loop work?")
  expect(prompts).toEqual([])
  await expect(editor).toHaveText("")

  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(other.id)}"]`).click()
  await expectSessionTitle(page, other.title)
  await editor.fill("/btw what belongs here?")
  await editor.press("Enter")
  await expect(panel.getByText("other session", { exact: false })).toBeVisible()

  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await expect(panel.getByText("other session", { exact: false })).toHaveCount(0)

  // Leaving a session abandons its in-flight question, so it reads as failed on return.
  await editor.fill("/btw is this question left behind?")
  await editor.press("Enter")
  await expect(panel.getByRole("status")).toContainText("Working")
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(other.id)}"]`).click()
  await expectSessionTitle(page, other.title)
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(panel.getByText("Couldn’t answer that question", { exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
  abandoned.resolve()

  await page.reload()
  await expectSessionTitle(page, main.title)
  await expect(page.getByRole("tab", { name: "is this question left behind?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  await expect(panel.getByText("Couldn’t answer that question", { exact: true })).toBeVisible()
  await expect(panel.getByRole("status")).toHaveCount(0)
  await expect(page.getByRole("tab", { name: "how does the retry loop work?", exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "how does the retry loop work?", exact: true }).click()
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(page.getByRole("tab", { name: "how does the retry loop work?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  expect(ownerWarnings).toEqual([])
})
