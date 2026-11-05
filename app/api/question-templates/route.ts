import { adminClient } from "@/lib/teacherBilling";

const QUESTION_TYPES = new Set(["multiple-choice", "drag-and-drop", "sort-into-groups", "dropdown", "fill-in-the-blank"]);
const TEMPLATE_QUESTION_ORDERS = [1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 16, 18, 19, 21, 22];
type BuiltInTemplateRow = {
  template_key: string;
  question_order: number;
  question_type: string;
  prompt: string;
  question_data: unknown;
};

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profile?.role !== "teacher") return Response.json({ error: "Teacher access required." }, { status: 403 });

    const protectedResult = await admin.from("default_assessment_template_questions")
      .select("template_key,question_order,question_type,prompt,question_data")
      .order("template_key")
      .order("question_order");
    let rows = (protectedResult.data || []) as BuiltInTemplateRow[];

    // Keep templates available while the protected-table migration is being
    // rolled out. This fallback is server-only and uses the admin client, so
    // it does not expose the source assessment to regular users.
    if (protectedResult.error || rows.length === 0) {
      const sourceResult = await admin.from("assessments")
        .select("id")
        .eq("title", "Grade 9 Practice Test - Mathematics - Part B")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (sourceResult.error || !sourceResult.data) throw sourceResult.error || protectedResult.error || new Error("Template source not found.");
      const questionResult = await admin.from("questions")
        .select("question_order,question_type,prompt,question_data")
        .eq("assessment_id", sourceResult.data.id)
        .in("question_order", TEMPLATE_QUESTION_ORDERS)
        .order("question_order");
      if (questionResult.error) throw questionResult.error;
      rows = (questionResult.data || []).map((row) => ({ ...row, template_key: "grade-9-math-practice-b" })) as BuiltInTemplateRow[];
    }

    const templates = rows.flatMap((row) => QUESTION_TYPES.has(row.question_type) ? [{
      id: `built-in-${row.template_key}-${row.question_order}`,
      name: `Question ${row.question_order}`,
      kind: "built-in" as const,
      question: {
        id: `built-in-${row.template_key}-${row.question_order}`,
        assessment_id: `built-in-${row.template_key}`,
        question_order: row.question_order,
        question_type: row.question_type,
        prompt: row.prompt,
        question_data: row.question_data,
      },
    }] : []);
    return Response.json({ templates });
  } catch (error) {
    console.error("Could not load built-in question templates:", error);
    return Response.json({ error: "Could not load the template library. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profile?.role !== "teacher") return Response.json({ error: "Teacher access required." }, { status: 403 });

    const body = await request.json() as { name?: unknown; question?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const question = body.question && typeof body.question === "object" ? body.question as Record<string, unknown> : null;
    if (!name || name.length > 120) return Response.json({ error: "Enter a template name between 1 and 120 characters." }, { status: 400 });
    if (!question || typeof question.question_type !== "string" || !QUESTION_TYPES.has(question.question_type) || !question.question_data || typeof question.question_data !== "object") {
      return Response.json({ error: "This question cannot be saved as a template." }, { status: 400 });
    }

    const { data, error } = await admin.from("reference_builds").insert({
      owner_id: auth.user.id,
      name: `__question_template__:${name}`,
      title: "",
      top_content: "",
      content: "",
      image_url: "",
      image_path: "",
      table_data: { question },
    }).select("id").single();
    if (error || !data) throw error || new Error("Template save returned no record.");
    return Response.json({ id: data.id });
  } catch (error) {
    console.error("Could not save question template:", error);
    return Response.json({ error: "Could not save this template. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profile?.role !== "teacher") return Response.json({ error: "Teacher access required." }, { status: 403 });

    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "Invalid template." }, { status: 400 });
    }

    const { data, error } = await admin.from("reference_builds")
      .delete()
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .like("name", "__question_template__:%")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Template not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Could not delete question template:", error);
    return Response.json({ error: "Could not delete this template. Please try again." }, { status: 500 });
  }
}
