import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

let javascript = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: 'import React from "react";import{createRoot}from"react-dom/client";import Page from "./app/teacher/assessments/[id]/page";const params=Promise.resolve({id:"assessment"});createRoot(document.getElementById("root")).render(<Page params={params}/>);',
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/question-editor-drafts.js",
    plugins: [{
      name: "teacher-test-services",
      setup(builder) {
        builder.onResolve({ filter: /^(next\/link|@\/lib\/(supabaseClient|roleGuard))$/ }, args => ({ path: args.path, namespace: "teacher-test-services" }));
        builder.onLoad({ filter: /.*/, namespace: "teacher-test-services" }, args => ({
          loader: "js", resolveDir: process.cwd(),
          contents: args.path === "next/link" ? 'import React from "react";export default function Link(props){return React.createElement("a",props)}'
            : args.path.endsWith("roleGuard") ? 'export const requireAccountRole=async()=>({id:"teacher"});'
            : `export const getCachedAccessToken=()=>"test-token";
export const supabase={auth:{getUser:async()=>({data:{user:{id:"teacher"}}}),getSession:async()=>({data:{session:{access_token:"test-token"}}})},
              from(table){let mutation=null;let target=null;const query={
                select(){return query},eq(key,value){if(key==="id")target=value;return query},in(){return query},order(){return query},range(){return query},single(){return query},
                upsert(value){mutation=value;return query},update(value){mutation=value;return query},
                then(resolve){let rows=JSON.parse(localStorage.getItem(table)||"[]");
                  if(mutation){const row={...rows.find(r=>r.id===(target||mutation.id)),...mutation,id:target||mutation.id};rows=[...rows.filter(r=>r.id!==row.id),row];localStorage.setItem(table,JSON.stringify(rows))}
                  resolve({data:table==="assessments"?{id:"assessment",title:"Draft test",is_published:false}:rows,error:null})
                }};return query}
            };`,
        }));
      },
    }],
  });
  javascript = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
});
async function open(page: Page) {
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.route("**/__draft-editor-test", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.route("**/api/question-templates", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const questions = await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]"));
    const templates = questions.filter((question: { assessment_id: string }) => question.assessment_id === "9172cd6c-e319-40a3-821e-84a6c365508b").map((question: { id: string; question_order: number }) => ({
      id: `built-in-${question.id}`, name: `Question ${question.question_order}`, kind: "built-in", question,
    }));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ templates }) });
  });
  await page.route("**/api/question-drafts**", async route => {
    if (route.request().method() === "POST") {
      const record = route.request().postDataJSON();
      await page.evaluate((value) => {
        const rows = JSON.parse(localStorage.getItem("question_drafts") || "[]");
        localStorage.setItem("question_drafts", JSON.stringify([...rows.filter((row: { id: string }) => row.id !== value.id), value]));
      }, record);
      await route.fulfill({ contentType: "application/json", body: '{"saved":true}' });
      return;
    }
    const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem("question_drafts") || "[]"));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ drafts }) });
  });
  await page.goto("/__draft-editor-test");
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addScriptTag({ type: "module", content: javascript });
  await expect(page.getByRole("button", { name: "Add Question", exact: false })).toBeVisible();
}

async function startNewQuestion(page: Page) {
  await page.getByRole("button", { name: "Add Question", exact: false }).click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
}

test("add question offers blank and template starting points", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("questions", JSON.stringify([{
    id: "source-question", assessment_id: "9172cd6c-e319-40a3-821e-84a6c365508b", question_type: "multiple-choice", prompt: "Template prompt", question_order: 1,
    question_data: { layout: "split", canvas: { version: 2, elements: [] }, leftCanvas: { version: 2, elements: [] }, choices: ["A", "B"], correctAnswer: "A" },
  }])));
  await open(page);
  await page.getByRole("button", { name: "Add Question", exact: false }).click();
  await expect(page.getByRole("heading", { name: "How would you like to start?" })).toBeVisible();
  await page.getByRole("button", { name: "Use a template", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Multiple Choice" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Custom Templates" })).toBeVisible();
  const thumbnailPreview = page.locator("[data-template-thumbnail-preview]").first();
  await expect(thumbnailPreview).toBeVisible();
  expect(await thumbnailPreview.evaluate((node) => (node as HTMLElement).offsetWidth)).toBe(1000);
  expect(await thumbnailPreview.evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
  await page.getByRole("button", { name: "Use template Question 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Template preview" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Use template", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How should this template be displayed?" })).toBeVisible();
  await page.getByRole("button", { name: /Single view/ }).click();
  await expect(page.getByRole("button", { name: /^Multiple Choice/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Canvas text" })).toContainText("Template prompt");
});

test("save as template uses an in-app naming dialog", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("questions", JSON.stringify([{
    id: "question-to-save", assessment_id: "assessment", question_type: "multiple-choice", prompt: "Reusable question", question_order: 1,
    question_data: { layout: "standard", canvas: { version: 2, elements: [] }, choices: ["A", "B"], correctAnswer: "A" },
  }])));
  await open(page);
  await page.getByRole("button", { name: "Save as template", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save as template" })).toBeVisible();
  await expect(page.getByLabel("Template name")).toHaveValue("Question 1 template");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save as template" })).toHaveCount(0);
});

test("custom template previews provide an in-app delete confirmation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("reference_builds", JSON.stringify([{
    id: "10000000-0000-4000-8000-000000000001", name: "__question_template__:My template",
    table_data: { question: { id: "saved-question", assessment_id: "assessment", question_type: "multiple-choice", prompt: "Saved template", question_order: 1, question_data: { layout: "standard", canvas: { version: 2, elements: [] }, choices: ["A", "B"], correctAnswer: "A" } } },
  }])));
  await open(page);
  await page.getByRole("button", { name: "Add Question", exact: false }).click();
  await page.getByRole("button", { name: "Use a template", exact: true }).click();
  await page.getByRole("tab", { name: "Custom Templates" }).click();
  await page.getByRole("button", { name: "Use template My template", exact: true }).click();
  await page.getByRole("button", { name: "Delete template", exact: true }).click();
  await expect(page.getByText("Delete permanently?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, delete", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete template", exact: true })).toBeVisible();
});

test("actual question editor restores unfinished setup and publishes a draft only on request", async ({ page }) => {
  await open(page);
  await startNewQuestion(page);
  await page.getByRole("button", { name: /^Dropdown/ }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await open(page);
  await page.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Dropdown/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "One canvas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "One canvas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish question", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // Fill a valid persisted draft to exercise the real publish path without coupling
  // this lifecycle test to the rich text/drag-and-drop controls' interaction tests.
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem("question_drafts") || "[]");
    const draft = records[0];
    draft.updated_at = new Date(Date.now() + 100).toISOString();
    draft.snapshot.questionCanvas.elements = [];
    draft.snapshot.dropdownData = { layout: "inline", template: "", entries: [{ id: "entry", label: "", options: ["Yes", "No"], correctAnswer: "Yes", x: 8, y: 40, width: 20, height: 8 }] };
    localStorage.setItem("question_drafts", JSON.stringify(records));
  });
  await open(page);
  await page.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish question", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]"))).toHaveLength(0);
  await page.getByRole("button", { name: "Publish question", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toHaveCount(0);
  const published = await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]"));
  expect(published).toHaveLength(1);
  expect(published[0].question_data.dropdown.entries[0].correctAnswer).toBe("Yes");
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Extend canvas", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem("question_drafts") || "[]");
    const draft = records.find((record: { status: string }) => record.status === "draft");
    draft.updated_at = new Date(Date.now() + 100).toISOString();
    draft.snapshot.dropdownData.entries[0].correctAnswer = "No";
    localStorage.setItem("question_drafts", JSON.stringify(records));
  });
  await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]")[0].question_data.dropdown.entries[0].correctAnswer)).toBe("Yes");
  await page.getByRole("button", { name: "Publish changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]")[0].question_data.dropdown.entries[0].correctAnswer)).toBe("No");
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toHaveCount(0);
});


test("location questions publish blank custom-sized options with more targets than items", async ({ page }) => {
  await open(page);
  await startNewQuestion(page);
  await page.getByRole("button", { name: /^Drag & Drop/ }).click();
  await page.getByRole("button", { name: "One canvas", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem("question_drafts") || "[]");
    const draft = records[0];
    draft.updated_at = new Date(Date.now() + 100).toISOString();
    draft.snapshot.dragDropData.items = [{ id: "item", content: "", x: 20, y: 30 }];
    draft.snapshot.dragDropData.choiceSize = { width: 150, height: 80 };
    draft.snapshot.dragDropData.choiceBankGrouped = false;
    draft.snapshot.dragDropData.canvasElements = [];
    draft.snapshot.dragDropData.zones = [0, 1, 2].map(index => ({
      id: "target-" + index, label: "", correctItemIds: index === 0 ? ["item"] : [],
      capacity: 1, x: 10 + index * 25, y: 50,
    }));
    localStorage.setItem("question_drafts", JSON.stringify(records));
  });
  await open(page);
  await page.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish question", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publish question", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  const published = await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]")[0]);
  expect(published.prompt).toBe("");
  expect(published.question_data.dragDrop.choiceSize).toEqual({ width: 150, height: 80 });
  expect(published.question_data.dragDrop.items[0].content).toBe("");
  expect(published.question_data.dragDrop.choiceBankGrouped).toBe(false);
  expect(published.question_data.dragDrop.zones.map((zone: { correctItemIds: string[] }) => zone.correctItemIds)).toEqual([["item"], [], []]);
});

test("empty drag items show no placeholders and preserve entered content", async ({ page }) => {
  await open(page);
  await startNewQuestion(page);
  await page.getByRole("button", { name: /^Drag & Drop/ }).click();
  await page.getByRole("button", { name: "One canvas", exact: true }).click();
  const firstItem = page.locator("[data-choice-item-id]").first();
  await expect(firstItem).toHaveText("");
  await firstItem.click();
  const editor = page.locator('[contenteditable="true"][data-placeholder=""]');
  await expect(editor).toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill("Custom option");
  await expect(firstItem).toHaveText("Custom option");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  const items = await page.evaluate(() => JSON.parse(localStorage.getItem("question_drafts") || "[]").find((row: { status: string }) => row.status === "draft").snapshot.dragDropData.items);
  expect(items[0].content).toBe("Custom option");
  expect(items[0].contentHtml).not.toContain("Item 1");
  expect(items[1].content).toBe("");
});

test("deleting a draft keeps it removed after reload without publishing a question", async ({ page }) => {
  await open(page);
  await startNewQuestion(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toBeVisible();
  // Hold local persistence to prove the row disappears before storage finishes.
  await page.evaluate(() => {
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
      const request = original(...args);
      const delayed = {} as IDBOpenDBRequest;
      request.onsuccess = () => {
        setTimeout(() => {
          Object.defineProperty(delayed, "result", { value: request.result });
          delayed.onsuccess?.call(delayed, new Event("success"));
        }, 1500);
      };
      return delayed;
    };
  });
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toHaveCount(0, { timeout: 500 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("question_drafts") || "[]")[0]?.snapshot)).toEqual({});
  await open(page);
  await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]"))).toHaveLength(0);
});

for (const mode of ["single", "multiple"]) {
  test(`multiple-choice ${mode} answers publish with blank choices`, async ({ page }) => {
    await open(page);
    await startNewQuestion(page);
    await page.getByRole("button", { name: /^Multiple Choice/ }).click();
    await page.getByRole("button", { name: "One canvas", exact: true }).click();
    await page.getByRole("button", { name: mode === "single" ? "One answer" : "Multiple answers", exact: true }).first().click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem("question_drafts") || "[]");
      const draft = records[0];
      draft.updated_at = new Date(Date.now() + 100).toISOString();
      draft.snapshot.choiceTexts = ["", "", "", ""];
      draft.snapshot.choiceHtml = ["", "", "", ""];
      draft.snapshot.correctChoiceIndex = 0;
      draft.snapshot.correctChoiceIndexes = [0];
      draft.snapshot.questionCanvas.choiceLayout = { grouped: true, direction: "vertical", x: 8, y: 35, positions: [], ...draft.snapshot.questionCanvas.choiceLayout, presentation: "content" };
      localStorage.setItem("question_drafts", JSON.stringify(records));
    });
    await open(page);
    await page.getByRole("button", { name: "Resume draft", exact: true }).click();
    await expect(page.getByRole("button", { name: "Publish question", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Publish question", exact: true }).click();
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    const published = await page.evaluate(() => JSON.parse(localStorage.getItem("questions") || "[]")[0]);
    expect(published.question_data.choices).toEqual(["", "", "", ""]);
    expect(published.question_data.correctAnswers).toHaveLength(1);
  });
}
