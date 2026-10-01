import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { buildMathExpressionHtml, createMathText } from "../../lib/mathExpressionTree";

let javascript = "";
let componentCss = "";

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import Page from "./app/student/[id]/page"; const params=Promise.resolve({id:"assessment"}); createRoot(document.getElementById("test-root")).render(<Page params={params}/>);',
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "esm",
    outfile: "/tmp/student-assessment-layout.js",
    tsconfig: "tsconfig.json",
    plugins: [{
      name: "assessment-test-services",
      setup(builder) {
        builder.onResolve({ filter: /^(next\/navigation|next\/link|@\/lib\/supabaseClient)$/ }, (args) => ({ path: args.path, namespace: "test-services" }));
        builder.onLoad({ filter: /.*/, namespace: "test-services" }, (args) => ({
          loader: "js", resolveDir: process.cwd(),
          contents: args.path === "next/navigation"
            ? 'const params=new URLSearchParams("preview=1"); export const useSearchParams=()=>params;'
            : args.path === "next/link"
              ? 'import React from "react"; export default function Link(props){return React.createElement("a",props);}'
              : `export const supabase={
                auth:{getUser:async()=>({data:{user:{id:"teacher",email:"teacher@example.com"}}}),getSession:async()=>({data:{session:null}})},
                from(table){const result=()=>({data:table==="questions"?window.__assessmentFixture.questions:table==="profiles"?{role:"teacher",full_name:"Teacher"}:window.__assessmentFixture.assessment,error:null});const query={select(){return query},eq(){return query},in(){return query},order:async()=>result(),single:async()=>result()};return query},
                rpc:async()=>({data:true,error:null})
              };`,
        }));
      },
    }],
  });
  javascript = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  componentCss = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

function fixtures(withResources = true, canvasHeight = 100) {
  const textCanvas = (text: string) => ({
    version: 2, canvasHeight,
    elements: [{ id: text, type: "text", text, x: 3, y: 6, width: 90, height: 8, fontSize: 22, verticalAlign: "top" }],
  });
  const choiceHtml = ["2 + 4", "2 × 4", "2 + 2 + 2 + 2", "2 × 2 × 2 × 2"].map((value, index) => buildMathExpressionHtml({
    type: "fraction", id: `fraction-${index}`, numerator: createMathText(value), denominator: createMathText(value.replaceAll("2", "3")),
  }));
  const choices = ["First answer", "Second answer", "Third answer", "Fourth answer"];
  const canvas = { ...textCanvas("Another representation of the expression is"), choiceLayout: { grouped: true, direction: "vertical", presentation: "content", x: 3, y: 15, positions: [] } };
  return {
    assessment: { id: "assessment", title: "Practice assessment", is_published: true, formula_sheet: withResources ? textCanvas("Formula reference: A = πr²") : null },
    questions: Array.from({ length: 17 }, (_, index) => ({
      id: `question-${index}`, assessment_id: "assessment", question_order: index,
      question_type: "multiple-choice", prompt: "Choose an answer",
      question_data: {
        choices, choiceHtml, correctAnswer: "A", layout: index === 1 || index === 3 ? "split" : "standard",
        ...(index === 2 || index === 3 ? {} : { canvas }),
        ...(index === 1 ? { leftCanvas: textCanvas("Original question reference") } : {}),
        ...(index === 3 ? { leftPanelTitle: "Original legacy reference", leftPanelContent: "<p>Original reading passage</p>" } : {}),
      },
    })),
  };
}

async function openAssessment(page: Page, withResources = true, canvasHeight = 100) {
  // Use the app's actual stylesheet and page component; replace only the backend/auth services.
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.goto("about:blank");
  await page.setContent('<div id="test-root"></div>');
  for (const url of stylesheets) await page.addStyleTag({ content: await (await page.request.get(url)).text() });
  await page.addStyleTag({ content: componentCss });
  await page.evaluate((fixture) => Object.assign(window, { __assessmentFixture: fixture }), fixtures(withResources, canvasHeight));
  await page.addScriptTag({ type: "module", content: javascript });
  await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
}

test("single canvas toggles to formula split view and restores its answer and width", async ({ page }) => {
  await page.setViewportSize({ width: 1971, height: 1280 });
  await openAssessment(page);
  const paper = page.getByRole("article", { name: "Question 1", exact: true });
  const initialWidth = (await paper.boundingBox())!.width;
  expect(initialWidth).toBeCloseTo((1971 - 184 - 56 - 16) * 0.8, 0);
  expect((await page.getByRole("complementary", { name: "Assessment navigation" }).boundingBox())!.width).toBe(184);
  const sections = page.getByLabel("Navigate the assessment", { exact: true });
  await expect(sections.locator("option")).toHaveText(["Questions"]);
  await sections.selectOption("questions");
  await expect(page.getByRole("navigation", { name: "Assessment questions" }).getByRole("button")).toHaveCount(17);
  await page.getByRole("radio", { name: "First answer", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Formula sheet", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Formula sheet" })).toContainText("Formula reference");
  expect((await paper.boundingBox())!.width).toBeGreaterThan(initialWidth);
  const splitBounds = (await paper.boundingBox())!;
  const headerBounds = (await paper.locator("header").boundingBox())!;
  expect(headerBounds.height).toBeLessThan(90);
  expect((await page.getByRole("complementary", { name: "Assessment navigation" }).boundingBox())!.width).toBe(184);
  expect(splitBounds.width).toBeCloseTo(1971 - 184 - 56 - 16, 0);
  const referenceBounds = (await page.getByRole("region", { name: "Formula sheet" }).boundingBox())!;
  const questionBounds = (await page.locator('[data-question-pane="right"]').boundingBox())!;
  expect(headerBounds.x).toBeCloseTo(splitBounds.x + splitBounds.width / 2, 0);
  expect(headerBounds.width).toBeCloseTo(splitBounds.width / 2, 0);
  expect(referenceBounds.y).toBeCloseTo(splitBounds.y, 0);
  expect(questionBounds.y).toBeGreaterThanOrEqual(headerBounds.y + headerBounds.height);

  await expect(page.getByRole("radio", { name: "First answer", exact: true })).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(page.getByRole("region", { name: "Formula sheet" })).toHaveCount(0);
  expect((await paper.boundingBox())!.width).toBeCloseTo(initialWidth, 0);
  await expect(page.getByRole("radio", { name: "First answer", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "/tmp/student-assessment-single.png", fullPage: true });
});

test("formula sheet replaces and restores the original left canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1971, height: 1280 });
  await openAssessment(page);
  await page.getByRole("navigation", { name: "Assessment questions" }).getByRole("button", { name: "Question 2", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Assessment questions" });
  await expect(navigation.getByRole("button", { name: "Question 2", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(navigation.getByRole("button", { name: "Question 2", exact: true })).toHaveCSS("background-color", "rgb(219, 234, 255)");
  await expect(navigation.getByRole("button", { name: "Question 1", exact: true })).not.toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("region", { name: "Question reference" })).toContainText("Original question reference");
  const paper = page.getByRole("article", { name: "Question 2", exact: true });
  const width = (await paper.boundingBox())!.width;
  await page.getByRole("button", { name: "Formula sheet", exact: true }).click();
  await expect(page.getByText("Original question reference", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Formula sheet" })).toContainText("Formula reference");
  expect((await paper.boundingBox())!.width).toBeCloseTo(width, 0);
  await page.screenshot({ path: "/tmp/student-assessment-formula.png", fullPage: true });
  await page.getByRole("button", { name: "Formula sheet", exact: true }).click();
  await expect(page.getByRole("region", { name: "Question reference" })).toContainText("Original question reference");
});

test("legacy questions restore their original layout after closing resources", async ({ page }) => {
  await openAssessment(page);
  const nav = page.getByRole("navigation", { name: "Assessment questions" });
  for (const question of [3, 4]) {
    await nav.getByRole("button", { name: `Question ${question}`, exact: true }).click();
    await page.getByRole("button", { name: "Formula sheet", exact: true }).click();
    await expect(page.getByRole("region", { name: "Formula sheet" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Formula sheet" })).toContainText("Formula reference");
    if (question === 4) await expect(page.getByText("Original legacy reference", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Formula sheet", exact: true }).click();
    await expect(page.getByRole("region", { name: "Formula sheet" })).toHaveCount(0);
    if (question === 4) await expect(page.getByText("Original legacy reference", { exact: true })).toBeVisible();
  }
});

test("navigation, flags, and unavailable resources remain usable on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAssessment(page, false);
  await expect(page.getByRole("button", { name: "Formula sheet", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Flag this question", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unflag this question" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand question navigation" }).click();
  await page.getByLabel("Navigate the assessment", { exact: true }).selectOption("questions");
  const nav = page.getByRole("navigation", { name: "Assessment questions" });
  await expect(nav.getByRole("button")).toHaveCount(17);
  await nav.getByRole("button", { name: "Question 1, flagged", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse question navigation" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("resource panel view controls switch left, split, and right without losing answers", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAssessment(page);
  const paper = page.getByRole("article", { name: "Question 1", exact: true });
  expect((await paper.boundingBox())!.width).toBeCloseTo((1280 - 184 - 56 - 16) * 0.8, 0);
  const controls = page.getByRole("group", { name: "Panel view", exact: true });
  await expect(controls).toHaveCount(0);
  const answer = page.getByRole("radio", { name: "First answer", exact: true });
  await answer.click();
  const toggle = page.getByRole("button", { name: "Formula sheet", exact: true });
  await toggle.click();
  await expect(controls.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  await controls.getByRole("button", { name: "Left", exact: true }).click();
  await expect(page.getByRole("region", { name: "Formula sheet" })).toBeVisible();
  await expect(answer).toBeHidden();
  await controls.getByRole("button", { name: "Right", exact: true }).click();
  await expect(page.getByRole("region", { name: "Formula sheet" })).toHaveCount(0);
  await expect(answer).toBeVisible();
  await expect(answer).toHaveAttribute("aria-checked", "true");
  await controls.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("region", { name: "Formula sheet" })).toBeVisible();
  await expect(answer).toBeVisible();
  await controls.getByRole("button", { name: "Left", exact: true }).click();
  await toggle.click();
  await expect(controls).toHaveCount(0);
  await expect(answer).toBeVisible();
  await expect(answer).toHaveAttribute("aria-checked", "true");
});

test("resource views restore normal split view and work for legacy questions", async ({ page }) => {
  await openAssessment(page);
  const nav = page.getByRole("navigation", { name: "Assessment questions" });
  const controls = page.getByRole("group", { name: "Panel view", exact: true });
  const toggle = page.getByRole("button", { name: "Formula sheet", exact: true });
  await nav.getByRole("button", { name: "Question 2", exact: true }).click();
  await controls.getByRole("button", { name: "Right", exact: true }).click();
  await toggle.click();
  await expect(controls.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  await controls.getByRole("button", { name: "Left", exact: true }).click();
  await toggle.click();
  await expect(controls.getByRole("button", { name: "Right", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Question reference" })).toHaveCount(0);
  for (const index of [3, 4]) {
    await nav.getByRole("button", { name: `Question ${index}`, exact: true }).click();
    await toggle.click();
    await controls.getByRole("button", { name: "Left", exact: true }).click();
    await expect(page.getByRole("region", { name: "Formula sheet" })).toBeVisible();
    await expect(page.locator("#student-question-content button").first()).toBeHidden();
    await controls.getByRole("button", { name: "Right", exact: true }).click();
    await expect(page.getByRole("region", { name: "Formula sheet" })).toHaveCount(0);
    await expect(page.locator("#student-question-content button").first()).toBeVisible();
    await toggle.click();
  }
});


test("student view preserves a 76 percent canvas in single and split modes", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openAssessment(page, true, 76);
  const panel = page.locator('[data-question-pane="right"]');
  for (const split of [false, true]) {
    if (split) await page.getByRole("button", { name: "Formula sheet", exact: true }).click();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.height / bounds.width).toBeCloseTo(.76, 2);
    const renderedCanvas = panel.locator(':scope > div').first();
    const canvasBounds = (await renderedCanvas.boundingBox())!;
    expect(canvasBounds.height).toBeCloseTo(bounds.height, 0);
    const prompt = panel.locator('.rich-text-content').first();
    const textBounds = (await prompt.boundingBox())!;
    expect((textBounds.y - canvasBounds.y) / canvasBounds.height).toBeCloseTo(.06, 2);
  }
});
