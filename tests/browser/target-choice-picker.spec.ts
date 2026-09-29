import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("target picker preserves fractions, supports clearing, and blocks already assigned items", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from "react";import{createRoot}from"react-dom/client";import Picker from "./app/teacher/assessments/[id]/TargetChoicePicker";
      const items=[{id:"a",content:"385",contentHtml:"<math><mfrac><mn>38</mn><mn>5</mn></mfrac></math>"},{id:"b",content:"385",contentHtml:"<math><mfrac><mn>3</mn><mn>85</mn></mfrac></math>"}];
      function App(){const[value,setValue]=useState("");return <><Picker items={items} value={value} disabledIds={["b"]} imageUrls={{}} onChange={setValue}/><output>{value}</output></>}
      createRoot(document.getElementById("root")).render(<App/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm", outfile: "/tmp/target-choice-picker.js",
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ type: "module", content: result.outputFiles.find(file => file.path.endsWith(".js"))!.text });
  await page.getByLabel("Correct choice", { exact: true }).click();
  const first = page.getByRole("button", { name: "Choose item 1" });
  await expect(first.locator("mfrac")).toBeVisible();
  await expect(first.locator("mn")).toHaveText(["38", "5"]);
  await expect(page.getByRole("button", { name: "Choose item 2" })).toBeDisabled();
  await first.click();
  await expect(page.locator("output")).toHaveText("a");
  await expect(page.locator("summary mfrac")).toBeVisible();
  await page.getByLabel("Correct choice", { exact: true }).click();
  await page.getByRole("button", { name: "No correct answer (leave empty)" }).click();
  await expect(page.locator("output")).toBeEmpty();
  await page.getByLabel("Correct choice", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Correct choice options" })).toBeHidden();
});
