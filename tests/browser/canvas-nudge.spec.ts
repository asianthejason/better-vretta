import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("canvas assets nudge one pixel, stay in bounds, and leave text input alone", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react"; import {createRoot} from "react-dom/client"; import Editor from "./app/teacher/assessments/[id]/LocationCanvasEditor";
      function App(){ const [data,setData]=useState({settings:{},items:[],zones:[],canvasElements:[{id:"text",type:"text",text:"Example",x:10,y:10,width:20,height:10}]});return <Editor compositionOnly data={data} onChange={setData} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/>} createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/canvas-nudge.js",
  });
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.goto("about:blank");
  await page.setContent('<div id="root"></div>');
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addStyleTag({ content: '[aria-label^="Canvas editor"]{width:1000px;position:relative}.absolute{position:absolute}.inset-0{inset:0}.pointer-events-none{pointer-events:none}' });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  const asset = page.locator('[data-nudge-id="text"]');
  await expect(asset).toBeVisible();
  await asset.click();
  const before = await asset.boundingBox();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const after = await asset.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(1, 1);
  expect(after!.y - before!.y).toBeCloseTo(1, 1);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  expect((await asset.boundingBox())!.x).toBeCloseTo(before!.x, 1);
  for (let i = 0; i < 110; i++) await page.keyboard.press("ArrowLeft");
  expect(await asset.evaluate(el => el.style.left)).toBe("0%");
  await asset.dblclick();
  const editor = asset.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  const left = await asset.evaluate(el => el.style.left);
  await page.keyboard.press("ArrowRight");
  expect(await asset.evaluate(el => el.style.left)).toBe(left);
  await page.keyboard.press("Delete");
  await expect(asset).toBeVisible();
  await page.getByLabel("Canvas editor", { exact: false }).focus();
  await page.keyboard.press("Delete");
  await expect(asset).toHaveCount(0);
});
