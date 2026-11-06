import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/classrooms/default-assessment/route";

test("default assessment endpoint accepts a copy already created by the template trigger", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://default-assessment-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  delete process.env.SUPABASE_SECRET_KEY;
  let sourceAssessmentReads = 0;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    requests.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "teacher-1" });
    if (url.pathname === "/rest/v1/classrooms") return Response.json({ id: "class-1", teacher_id: "teacher-1" });
    if (url.pathname === "/rest/v1/classroom_teachers") return Response.json(null);
    if (url.pathname === "/rest/v1/assessments") {
      if (url.searchParams.get("id")) sourceAssessmentReads += 1;
      return Response.json({ id: "existing-example" });
    }
    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };
  try {
    const response = await POST(new Request("http://localhost/api/classrooms/default-assessment", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ classroomId: "class-1" }),
    }));
    assert.equal(response.status, 200, requests.join("\n"));
    assert.deepEqual(await response.json(), { created: false, assessmentId: "existing-example" });
    assert.equal(sourceAssessmentReads, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("default assessment endpoint copies the oldest surviving example when protected templates are empty", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://default-assessment-fallback.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  delete process.env.SUPABASE_SECRET_KEY;
  const sourceId = "00000000-0000-4000-8000-000000000100";
  const copyId = "00000000-0000-4000-8000-000000000200";
  let insertedQuestions: unknown = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const method = init?.method || "GET";
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "teacher-1" });
    if (url.pathname === "/rest/v1/classrooms") return Response.json({ id: "class-1", teacher_id: "teacher-1" });
    if (url.pathname === "/rest/v1/classroom_teachers") return Response.json(null);
    if (url.pathname === "/rest/v1/default_assessment_templates") return Response.json(null);
    if (url.pathname === "/rest/v1/assessments" && method === "POST") return Response.json({ id: copyId });
    if (url.pathname === "/rest/v1/assessments" && url.searchParams.has("template_key")) return Response.json(null);
    if (url.pathname === "/rest/v1/assessments" && url.searchParams.has("classroom_id")) return Response.json(null);
    if (url.pathname === "/rest/v1/assessments") return Response.json({
      id: sourceId,
      title: "Grade 9 Practice Test - Mathematics - Part B",
      description: "Surviving example",
      formula_sheet: {},
    });
    if (url.pathname === "/rest/v1/questions" && method === "POST") {
      insertedQuestions = JSON.parse(String(init?.body));
      return Response.json(null, { status: 201 });
    }
    if (url.pathname === "/rest/v1/questions") return Response.json([{
      question_order: 1,
      question_type: "multiple-choice",
      prompt: "Example question",
      question_data: { choices: ["A", "B"], correctAnswer: "A" },
    }]);
    throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`);
  };
  try {
    const response = await POST(new Request("http://localhost/api/classrooms/default-assessment", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ classroomId: "class-1" }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { created: true, assessmentId: copyId });
    assert.deepEqual(insertedQuestions, [{
      assessment_id: copyId,
      question_order: 1,
      question_type: "multiple-choice",
      prompt: "Example question",
      question_data: { choices: ["A", "B"], correctAnswer: "A" },
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("default assessment creation remains compatible before assessments.template_key is added", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://default-assessment-legacy.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  delete process.env.SUPABASE_SECRET_KEY;
  let assessmentInsert: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const method = init?.method || "GET";
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "teacher-1" });
    if (url.pathname === "/rest/v1/classrooms") return Response.json({ id: "class-1", teacher_id: "teacher-1" });
    if (url.pathname === "/rest/v1/classroom_teachers") return Response.json(null);
    if (url.pathname === "/rest/v1/assessments" && method === "POST") {
      assessmentInsert = JSON.parse(String(init?.body));
      return Response.json({ id: "copy-1" });
    }
    if (url.pathname === "/rest/v1/assessments" && url.searchParams.has("template_key")) {
      return Response.json({ code: "PGRST204", message: "Could not find the 'template_key' column" }, { status: 400 });
    }
    if (url.pathname === "/rest/v1/assessments") return Response.json(null);
    if (url.pathname === "/rest/v1/default_assessment_templates") return Response.json({
      title: "Grade 9 Practice Test - Mathematics - Part B", description: "Example", formula_sheet: {},
    });
    if (url.pathname === "/rest/v1/default_assessment_template_questions") return Response.json([{
      question_order: 1, question_type: "multiple-choice", prompt: "Example", question_data: {},
    }]);
    if (url.pathname === "/rest/v1/questions" && method === "POST") return Response.json(null, { status: 201 });
    throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`);
  };
  try {
    const response = await POST(new Request("http://localhost/api/classrooms/default-assessment", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ classroomId: "class-1" }),
    }));
    assert.equal(response.status, 200);
    assert.equal(assessmentInsert?.template_key, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
