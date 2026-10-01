import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("ungrouped option boxes snap to each others edges", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react"; import {createRoot} from "react-dom/client"; import Editor from "./app/teacher/assessments/[id]/LocationCanvasEditor";
      function App(){ const [data,setData]=useState({settings:{},choiceBankGrouped:false,items:[{id:"a",content:"",x:22,y:23,width:10,height:10},{id:"b",content:"",x:65,y:60,width:10,height:10}],zones:[],canvasElements:[]});return <Editor choiceOnly data={data} onChange={setData} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/>} createRoot(document.getElementById("root")).render(<App/>);`,
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
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
  await page.mouse.down();
  await page.mouse.move(a.x+b.width/2+3,b.y+b.height/2,{steps:8});
  await page.mouse.up();
  expect((await second.boundingBox())!.x).toBeCloseTo(a.x,0);
  const aligned = (await second.boundingBox())!;
  await page.mouse.move(aligned.x+aligned.width/2,aligned.y+aligned.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,a.y+b.height/2+3,{steps:8});
  await page.mouse.up();
  expect((await second.boundingBox())!.y).toBeCloseTo(a.y,0);
});
