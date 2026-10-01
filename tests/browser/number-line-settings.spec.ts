import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

async function openEditor(page: Page, kind: "canvas" | "choice") {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react";import{createRoot}from"react-dom/client";
      import Canvas from "./app/teacher/assessments/[id]/LocationCanvasEditor";
      import RichText from "./app/teacher/assessments/[id]/RichTextEditor";
      function App(){const[data,setData]=useState(()=>JSON.parse(localStorage.getItem("number-line-test")||'null')||${kind === "canvas" ? '{settings:{},items:[],zones:[],canvasElements:[]}' : '""'});const change=value=>{setData(value);localStorage.setItem("number-line-test",JSON.stringify(value))};return <main style={{maxWidth:1000,margin:"30px auto"}}>${kind === "canvas" ? '<Canvas compositionOnly data={data} onChange={change} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/>' : '<RichText allowNumberLines value={data} onChange={change} placeholder="Choice text"/>'}</main>}createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    }, bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/number-line-settings.js",
  });
  await page.goto("/");
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.route("**/__number-line-test", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("/__number-line-test");
  for (const url of sheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
}

for (const kind of ["canvas", "choice"] as const) {
  test(`${kind} number line supports the same inequality settings and persists edits`, async ({ page }) => {
    await openEditor(page, kind);
    await page.getByRole("button", { name: kind === "canvas" ? "+ Number line" : "Build a number line", exact: true }).click();
    const panel = page.locator("[data-number-line-settings]");
    await panel.getByLabel("Number line preset").selectOption("decimal");
    await expect(panel.locator('[data-ray-endpoint="open"]')).toHaveCount(1);
    await expect(panel.locator("svg text")).toHaveText(["2.05", "2.15", "2.25", "2.35", "2.45", "2.55"]);
    await expect(panel.getByLabel("Ray 1 direction")).not.toBeVisible();
    await panel.locator("summary").filter({ hasText: "Ray 1 ·" }).click();
    await panel.getByLabel("Ray 1 direction").selectOption("right");
    await panel.getByLabel("Ray 1 endpoint value").fill("2.35");
    await panel.getByRole("button", { name: "Ray 1 closed endpoint" }).click();
    await panel.getByRole("button", { name: "+ Add ray", exact: true }).click();
    await panel.locator("summary").filter({ hasText: "Ray 2 ·" }).click();
    await panel.getByLabel("Ray 2 direction").selectOption("left");
    await panel.getByLabel("Ray 2 endpoint value").fill("2.15");
    await panel.locator("summary").filter({ hasText: "Ray 2 ·" }).click();
    await expect(panel.getByLabel("Ray 2 endpoint value")).not.toBeVisible();
    await expect(panel.locator("summary").filter({ hasText: "Ray 2 ·" })).toContainText("x < 2.15");
    await expect(panel.locator('[data-number-line-ray]')).toHaveCount(2);
    await panel.getByRole("tab", { name: "Scale", exact: true }).click();
    const spacing = panel.getByLabel("Tick spacing", { exact: true });
    await spacing.focus();
    await spacing.press("ArrowUp");
    await expect(spacing).toHaveValue("0.1");
    await spacing.press("ArrowDown");
    await expect(spacing).toHaveValue("0.05");
    await panel.getByLabel("Label placement").selectOption("specific");
    await panel.getByLabel("Values to label").fill("2.05, 2.15, 2.55");
    await expect(panel.locator("svg text")).toHaveText(["2.05", "2.15", "2.55"]);
    await panel.getByRole("tab", { name: "Appearance" }).click();
    await panel.getByLabel("Percent", { exact: true }).fill("10");
    await panel.getByRole("button", { name: kind === "canvas" ? "Done" : "Insert number line", exact: true }).click();
    const rendered = kind === "canvas" ? page.locator('[data-nudge-kind="element"] svg').first() : page.locator('[data-choice-number-line] svg');
    await expect(rendered.locator('[data-ray-endpoint="closed"]')).toHaveCount(1);
    await expect(rendered.locator('[data-ray-endpoint="open"]')).toHaveCount(1);
    await expect(rendered.locator("text")).toHaveText(["2.05", "2.15", "2.55"]);
    const markup = await rendered.innerHTML();
    await openEditor(page, kind);
    await expect(rendered).toBeVisible();
    expect(await rendered.innerHTML()).toBe(markup);
    if (kind === "canvas") await rendered.click();
    else await rendered.dblclick();
    await panel.getByRole("tab", { name: "Markings" }).click();
    await expect(panel.getByLabel("Ray 1 endpoint value")).toHaveValue("2.35");
    await expect(panel.getByLabel("Ray 1 direction")).toHaveValue("right");
    await expect(panel.getByLabel("Ray 2 endpoint value")).toHaveValue("2.15");
    await panel.locator("summary").filter({ hasText: "Ray 1 ·" }).click();
    await panel.getByRole("button", { name: "Remove ray 1", exact: true }).click();
    await expect(panel.getByLabel("Ray 1 endpoint value")).toHaveValue("2.15");
    await expect(panel.locator('[data-number-line-ray]')).toHaveCount(1);
    await panel.getByRole("tab", { name: "Appearance" }).click();
    await expect(panel.getByLabel("Percent", { exact: true })).toHaveValue("10");
    await panel.getByRole("tab", { name: "Scale", exact: true }).click();
    await expect(panel.getByLabel("Label placement")).toHaveValue("specific");
    await expect(panel.getByLabel("Values to label")).toHaveValue("2.05, 2.15, 2.55");
    await panel.getByLabel("Maximum", { exact: true }).fill("1");
    await expect(panel.getByRole("alert")).toContainText("maximum greater than the minimum");
    await expect(panel.getByRole("button", { name: kind === "canvas" ? "Done" : "Update number line", exact: true })).toBeDisabled();
    await panel.getByLabel("Maximum", { exact: true }).fill("2.6");
    await page.screenshot({ path: `/tmp/number-line-${kind}.png`, fullPage: true });
  });
}

test("choice number line window floats, drags, and dismisses without changing the choice", async ({ page }) => {
  await openEditor(page, "choice");
  const choice = page.locator('[contenteditable="true"]').first();
  const before = await choice.boundingBox();
  await page.getByRole("button", { name: "Build a number line", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Number line editor" });
  await expect(dialog).toBeVisible();
  expect(await choice.boundingBox()).toEqual(before);
  const start = await dialog.boundingBox();
  const handle = await dialog.locator("[data-number-line-drag-handle]").boundingBox();
  await page.mouse.move(handle!.x + 60, handle!.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 160, handle!.y + 100, { steps: 5 });
  await page.mouse.up();
  const moved = await dialog.boundingBox();
  expect(moved!.x - start!.x).toBeCloseTo(100, 0);
  expect(moved!.y - start!.y).toBeCloseTo(80, 0);
  await dialog.getByLabel("Minimum", { exact: true }).fill("-10");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(choice.locator("[data-choice-number-line]")).toHaveCount(0);
  await page.getByRole("button", { name: "Build a number line", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const destination of ["canvas", "choice"] as const) {
  test(`paste inside the ${destination} number line panel restores copied settings`, async ({ page }) => {
    await openEditor(page, "canvas");
    await page.getByRole("button", { name: "+ Number line", exact: true }).click();
    let panel = page.locator("[data-number-line-settings]");
    await panel.getByLabel("Number line preset").selectOption("decimal");
    await panel.getByRole("button", { name: "Copy number line", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Copied");
    await page.evaluate(() => localStorage.removeItem("number-line-test"));
    await openEditor(page, destination);
    await expect(page.getByRole("button", { name: "Paste number line", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: destination === "canvas" ? "+ Number line" : "Build a number line", exact: true }).click();
    panel = page.locator("[data-number-line-settings]");
    await panel.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Pasted");
    await expect(panel.locator('[data-ray-endpoint="open"]')).toHaveCount(1);
    await expect(panel.locator("svg text")).toHaveText(["2.05", "2.15", "2.25", "2.35", "2.45", "2.55"]);
    await expect(panel.getByLabel("Tick spacing", { exact: true })).toHaveValue("0.05");
    await panel.getByLabel("Tick spacing", { exact: true }).fill("0.1");
    await panel.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(panel.getByLabel("Tick spacing", { exact: true })).toHaveValue("0.05");
  });
}
