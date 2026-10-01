import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("drag-and-drop options ungroup, move independently, and retain student positions", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react";import{createRoot}from"react-dom/client";
      import Editor from "./app/teacher/assessments/[id]/LocationCanvasEditor";
      import Student from "./app/student/[id]/DragDropQuestion";
      function App(){const[data,setData]=useState({preset:"locations",settings:{shuffleItems:false,allowReuse:false},items:[{id:"a",content:"Alpha"},{id:"b",content:"Beta"},{id:"c",content:""}],zones:[{id:"target",label:"Target",x:70,y:70,capacity:1,correctItemIds:["a"]}],choiceBankGrouped:true,choiceBankX:8,choiceBankY:6,canvasElements:[]});const[placements,setPlacements]=useState({});return <main style={{width:1000,margin:"20px auto"}}><Editor data={data} onChange={setData} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/><section aria-label="Student preview"><Student data={JSON.parse(JSON.stringify(data))} placements={placements} onChange={setPlacements}/></section></main>}createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    }, bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/drag-drop-ungroup.js",
  });
  await page.goto("/");
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.route("**/__ungroup-test", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("/__ungroup-test");
  for (const url of sheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  const blank = page.locator('[data-choice-item-id="c"]');
  await expect(blank).toHaveText("");
  await blank.click();
  await page.getByLabel("Option width (% of canvas width)", { exact: true }).fill("15");
  await page.getByLabel("Option height (% of canvas width)", { exact: true }).fill("8");
  const blankSize = await blank.boundingBox();
  const otherSize = await page.locator('[data-choice-item-id="a"]').boundingBox();
  const targetSize = await page.locator('[data-nudge-kind="zone"]').boundingBox();
  expect(otherSize!.width).toBeCloseTo(blankSize!.width, 0);
  expect(otherSize!.height).toBeCloseTo(blankSize!.height, 0);
  expect(targetSize!.width).toBeCloseTo(blankSize!.width, 0);
  expect(targetSize!.height).toBeCloseTo(blankSize!.height, 0);
  const studentBlank = await page.getByRole("region", { name: "Student preview" }).getByRole("button", { name: "Option 3" }).boundingBox();
  const editorCanvas = await page.getByLabel("Canvas editor", { exact: false }).boundingBox();
  const studentCanvas = await page.getByRole("region", { name: "Student preview" }).locator('[style*="container-type"]').boundingBox();
  expect(studentBlank!.width / studentCanvas!.width).toBeCloseTo(blankSize!.width / editorCanvas!.width, 2);
  expect(studentBlank!.height / studentCanvas!.width).toBeCloseTo(blankSize!.height / editorCanvas!.width, 2);
  const resize = page.getByLabel("Resize choice from right", { exact: true });
  const handle = await resize.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + 30, handle!.y + handle!.height / 2, { steps: 3 });
  await page.mouse.up();
  expect((await blank.boundingBox())!.width).toBeGreaterThan(blankSize!.width + 20);
  expect((await page.locator('[data-nudge-kind="zone"]').boundingBox())!.width).toBeCloseTo((await blank.boundingBox())!.width, 0);
  await page.getByRole("button", { name: "Close choice editor" }).click();
  const before = await page.locator('[data-choice-item-id="a"]').boundingBox();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  const alpha = page.locator('[data-nudge-kind="item"][data-nudge-id="a"]');
  const beta = page.locator('[data-nudge-kind="item"][data-nudge-id="b"]');
  const after = await alpha.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  const betaBefore = await beta.boundingBox();
  await page.mouse.move(after!.x + 10, after!.y + 10);
  await page.mouse.down();
  await page.mouse.move(after!.x + 110, after!.y + 110, { steps: 5 });
  await page.mouse.up();
  expect(await beta.boundingBox()).toEqual(betaBefore);
  expect((await alpha.boundingBox())!.y).toBeGreaterThan(after!.y + 80);
  const position = await alpha.evaluate(el => ({ left: el.style.left, top: el.style.top }));
  const preview = page.getByRole("region", { name: "Student preview" });
  await expect(preview.locator('[data-choice-slot="a"]')).toHaveCSS("position", "absolute");
  expect(await preview.locator('[data-choice-slot="a"]').evaluate(el => ({ left: el.style.left, top: el.style.top }))).toEqual(position);
  const betaPosition = await preview.locator('[data-choice-slot="b"]').getAttribute("style");
  await preview.getByRole("button", { name: "Alpha", exact: true }).click();
  await preview.locator('[class*="z-20"]').click();
  await expect(preview.locator('[data-choice-slot="a"]').getByRole("button")).toHaveAccessibleName(/Return selected choice/);
  expect(await preview.locator('[data-choice-slot="b"]').getAttribute("style")).toBe(betaPosition);
  await page.getByRole("button", { name: "Group choices", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toBeVisible();
});
