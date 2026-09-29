import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

let javascript = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React,{useMemo,useState} from "react";import{createRoot}from"react-dom/client";import{useQuestionDrafts}from"./app/teacher/assessments/[id]/useQuestionDrafts";
      function App(){
        const[text,setText]=useState("");const[file,setFile]=useState(null);const[preview,setPreview]=useState("");const[open,setOpen]=useState(false);
        const snapshot=useMemo(()=>({text,file,preview}),[text,file,preview]);
        const drafts=useQuestionDrafts({ownerId:"teacher",assessmentId:"assessment",snapshot,enabled:open});
        return <><button onClick={()=>{drafts.begin();setOpen(true)}}>New question</button>
          {open&&<><input aria-label="Question text" value={text} onChange={e=>setText(e.target.value)}/><input aria-label="Image" type="file" onChange={e=>{setFile(e.target.files[0]);setPreview(URL.createObjectURL(e.target.files[0]))}}/>
          <button onClick={async()=>{await drafts.save(false);setOpen(false);setText("");setFile(null);setPreview("")}}>Close editor</button>
          <button onClick={()=>drafts.save()}>Save draft</button><button onClick={async()=>{await drafts.complete();setOpen(false)}}>Publish</button>
          {preview&&<img alt="Draft image" src={preview}/>}<output>{file?.name}</output></>}
          <p role="status" aria-label="Draft save status">{drafts.message}</p>{drafts.records.map(record=><button key={record.id} onClick={async()=>{const value=await drafts.restore(record);setText(value.text);setFile(value.file);setPreview(value.preview);setOpen(true)}}>Resume draft</button>)}</>;
      }createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/question-drafts.js",
    plugins: [{
      name: "draft-backend",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/supabaseClient$/ }, args => ({ path: args.path, namespace: "draft-backend" }));
        builder.onLoad({ filter: /.*/, namespace: "draft-backend" }, () => ({
          contents: `export const supabase={from(){return{
            select(){const result={eq(){return result},then(resolve){resolve({data:JSON.parse(localStorage.getItem("cloud-drafts")||"[]")})}};return result},
            async upsert(row){window.__saveStarted=(window.__saveStarted||0)+1;await new Promise(r=>setTimeout(r,window.__saveDelay||0));
              if(window.__offline)return{error:{message:"Offline"}};
              const rows=JSON.parse(localStorage.getItem("cloud-drafts")||"[]");localStorage.setItem("cloud-drafts",JSON.stringify([...rows.filter(r=>r.id!==row.id),row]));return{error:null}}
          }}};`, loader: "js",
        }));
      },
    }],
  });
  javascript = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
});
async function open(page: Page) {
  await page.route("**/__draft-hook-test", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("/__draft-hook-test");
  await page.addScriptTag({ type: "module", content: javascript });
  await expect(page.getByRole("button", { name: "New question" })).toBeVisible();
}

test("slow autosave never rolls back typing or focus; close and reload restore latest text", async ({ page }) => {
  await open(page);
  await page.evaluate(() => Object.assign(window, { __saveDelay: 2000 }));
  await page.getByRole("button", { name: "New question" }).click();
  const input = page.getByLabel("Question text");
  await input.fill("First version");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __saveStarted: number }).__saveStarted || 0)).toBeGreaterThan(0);
  await input.press("End");
  await input.pressSequentially(" plus newer typing");
  await expect(page.getByRole("status", { name: "Draft save status" })).toHaveText("Draft saved", { timeout: 12000 });
  await expect(input).toHaveValue("First version plus newer typing");
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Close editor" }).click();
  await open(page);
  await page.getByRole("button", { name: "Resume draft" }).click();
  await expect(page.getByLabel("Question text")).toHaveValue("First version plus newer typing");
});

test("offline draft retains a pending image and publishes without resurrecting a draft", async ({ page }) => {
  await open(page);
  await page.evaluate(() => Object.assign(window, { __offline: true }));
  await page.getByRole("button", { name: "New question" }).click();
  await page.getByLabel("Question text").fill("Unfinished question");
  await page.getByLabel("Image", { exact: true }).setInputFiles({ name: "diagram.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>') });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status", { name: "Draft save status" })).toContainText("Saved on this device.");
  await page.getByRole("button", { name: "Close editor" }).click();
  await open(page);
  await page.getByRole("button", { name: "Resume draft" }).click();
  await expect(page.getByLabel("Question text")).toHaveValue("Unfinished question");
  await expect(page.locator("output")).toHaveText("diagram.svg");
  await expect(page.getByAltText("Draft image")).toBeVisible();
  expect(await page.getByAltText("Draft image").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(10);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume draft" })).toHaveCount(0);
  await open(page);
  await expect(page.getByRole("button", { name: "Resume draft" })).toHaveCount(0);
});

test("reconnecting retries all offline drafts, not only the currently edited question", async ({ page }) => {
  await open(page);
  await page.evaluate(() => Object.assign(window, { __offline: true }));
  for (const text of ["First offline question", "Second offline question"]) {
    await page.getByRole("button", { name: "New question" }).click();
    await page.getByLabel("Question text").fill(text);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status", { name: "Draft save status" })).toContainText("Saved on this device.");
    await page.getByRole("button", { name: "Close editor" }).click();
  }
  await page.evaluate(() => {
    Object.assign(window, { __offline: false });
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("cloud-drafts") || "[]").length)).toBe(2);
  const texts = await page.evaluate(() => JSON.parse(localStorage.getItem("cloud-drafts") || "[]").map((row: { snapshot: { text: string } }) => row.snapshot.text).sort());
  expect(texts).toEqual(["First offline question", "Second offline question"]);
});
