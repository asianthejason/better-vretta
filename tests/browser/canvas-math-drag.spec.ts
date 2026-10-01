import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("small math text boxes drag from the expression and still open for editing", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react"; import {createRoot} from "react-dom/client"; import Editor from "./app/teacher/assessments/[id]/LocationCanvasEditor"; import {buildMathExpressionHtml,createMathText} from "./lib/mathExpressionTree";
      function App(){ const [data,setData]=useState({settings:{},items:[],zones:[],canvasElements:[{id:"text",type:"text",text:"√p",textHtml:buildMathExpressionHtml({type:"root",id:"root",index:createMathText("2"),radicand:createMathText("p")}),x:10,y:10,width:7,height:10}]});return <Editor compositionOnly data={data} onChange={setData} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/>} createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/canvas-math-drag.js",
  });
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  await page.goto("about:blank");
  await page.setContent('<div id="root"></div>');
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addStyleTag({ content: '[aria-label^="Canvas editor"]{width:1000px;position:relative}.absolute{position:absolute}.inset-0{inset:0}.pointer-events-none{pointer-events:none}' });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  const asset = page.locator('[data-nudge-id="text"]');
  const math = asset.locator("math");
  await expect(math).toBeVisible();
  const before = (await asset.boundingBox())!;
  const center = (await math.boundingBox())!;
  await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
  await page.mouse.down();
  await page.mouse.move(center.x + center.width / 2 + 90, center.y + center.height / 2 + 55, { steps: 8 });
  await page.mouse.up();
  const after = (await asset.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 70);
  expect(after.y).toBeGreaterThan(before.y + 35);
  await math.dblclick();
  await expect(asset.locator('[contenteditable="true"]')).toBeVisible();
});
