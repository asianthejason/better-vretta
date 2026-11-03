import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("multiple-choice images scale with their resized option", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React from "react";import{createRoot}from"react-dom/client";import Canvas from "./app/components/QuestionCanvas";
      const image="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%232563eb'/%3E%3C/svg%3E";
      const canvas=(width,height)=>({version:2,canvasHeight:56.25,elements:[],choiceLayout:{grouped:false,direction:"vertical",presentation:"content",x:8,y:35,positions:[{x:8,y:12,width,height}]}});
      createRoot(document.getElementById("root")).render(<main style={{width:1000}}><section id="small"><Canvas canvas={canvas(16,16)} choices={[{text:"Image option",imageUrl:image}]}/></section><section id="large"><Canvas canvas={canvas(32,32)} choices={[{text:"Image option",imageUrl:image}]}/></section></main>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    outfile: "/tmp/multiple-choice-image-scale.js",
  });

  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.goto("about:blank");
  await page.setContent('<div id="root"></div>');
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addScriptTag({ type: "module", content: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text });

  const smallOption = (await page.locator("#small").getByLabel("Image option").boundingBox())!;
  const largeOption = (await page.locator("#large").getByLabel("Image option").boundingBox())!;
  const smallImage = (await page.locator("#small img").boundingBox())!;
  const largeImage = (await page.locator("#large img").boundingBox())!;

  expect(largeOption.width).toBeGreaterThan(smallOption.width * 1.9);
  expect(largeOption.height).toBeGreaterThan(smallOption.height * 1.9);
  expect(largeImage.width).toBeGreaterThan(smallImage.width * 1.9);
  expect(largeImage.height).toBeGreaterThan(smallImage.height * 1.9);
});
