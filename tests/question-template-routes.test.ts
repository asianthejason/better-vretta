import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/question-templates/route";

test("built-in templates fall back to a surviving source until the protected migration is applied", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://template-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-key";
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "teacher" });
    if (url.pathname === "/rest/v1/profiles") return Response.json({ role: "teacher" });
    if (url.pathname === "/rest/v1/default_assessment_template_questions") {
      return Response.json({ code: "PGRST205", message: "Table not found" }, { status: 404 });
    }
    if (url.pathname === "/rest/v1/assessments") return Response.json([{ id: "source-assessment" }]);
    if (url.pathname === "/rest/v1/questions") return Response.json([{
      question_order: 1,
      question_type: "multiple-choice",
      prompt: "Template question",
      question_data: { choices: ["A", "B"], correctAnswer: "A" },
    }]);
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const response = await GET(new Request("http://localhost/api/question-templates", { headers: { Authorization: "Bearer token" } }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.templates.length, 1);
    assert.equal(result.templates[0].name, "Question 1");
    assert.equal(result.templates[0].question.prompt, "Template question");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("the separate Sort into Groups source remains available when it is absent from the Grade 9 snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://template-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-key";
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "teacher" });
    if (url.pathname === "/rest/v1/profiles") return Response.json({ role: "teacher" });
    if (url.pathname === "/rest/v1/default_assessment_template_questions") {
      return Response.json([{ template_key: "grade-9", question_order: 1, question_type: "multiple-choice", prompt: "Math", question_data: {} }]);
    }
    if (url.pathname === "/rest/v1/questions") return Response.json({
      question_order: 1,
      question_type: "sort-into-groups",
      prompt: "Sort the statements",
      question_data: { dragDrop: { preset: "category-canvas" } },
    });
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const response = await GET(new Request("http://localhost/api/question-templates", { headers: { Authorization: "Bearer token" } }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.templates.map((template: { question: { question_type: string } }) => template.question.question_type), ["multiple-choice", "sort-into-groups"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
