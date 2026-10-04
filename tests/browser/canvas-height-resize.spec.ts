import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("changing canvas height preserves content positions and sizes", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react"; import {createRoot} from "react-dom/client"; import Editor from "./app/teacher/assessments/[id]/LocationCanvasEditor";
      function App(){ const [data,setData]=useState({settings:{},choiceBankGrouped:false,items:[{id:"a",content:"",x:22,y:23,width:10,height:10},{id:"b",content:"",x:65,y:60,width:10,height:10}],zones:[],canvasElements:[{id:"c",type:"text",text:"Fixed text",x:10,y:10,width:30,height:15}]});return <Editor choiceOnly data={data} onChange={setData} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/>} createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/choice-snap.js",
  });
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.goto("about:blank");
  await page.setContent('<div id="root"></div>');
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addStyleTag({ content: '[aria-label^="Canvas editor"]{width:1000px;position:relative}.absolute{position:absolute}.inset-0{inset:0}.pointer-events-none{pointer-events:none}' });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  const first = page.locator('[data-nudge-id="a"]');
  const second = page.locator('[data-nudge-id="b"]');
  const third = page.locator('[data-nudge-id="c"]');
  const safeArea = page.locator("[data-canvas-safe-area]");
  const safeBefore = (await safeArea.boundingBox())!;
  const before = await Promise.all([first.boundingBox(), second.boundingBox(), third.boundingBox()]);
  await page.getByRole('button', {name:'Extend canvas',exact:true}).click();
  await page.getByRole('button', {name:'Extend canvas',exact:true}).click();
  const safeAfter = (await safeArea.boundingBox())!;
  expect(safeAfter.y).toBeCloseTo(safeBefore.y, 0);
  expect(safeAfter.x).toBeCloseTo(safeBefore.x, 0);
  expect(safeAfter.width).toBeCloseTo(safeBefore.width, 0);
  expect(safeAfter.height).toBeGreaterThan(safeBefore.height);
  for (const [index, node] of [first,second,third].entries()) {
    const after=(await node.boundingBox())!;
    expect(after.y).toBeCloseTo(before[index]!.y,0);
    expect(after.height).toBeCloseTo(before[index]!.height,0);
  }
  await page.getByRole('button', {name:'Shorten canvas',exact:true}).click();
  expect((await second.boundingBox())!.y).toBeCloseTo(before[1]!.y,0);
});
