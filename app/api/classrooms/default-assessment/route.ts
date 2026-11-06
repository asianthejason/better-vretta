import { adminClient } from "@/lib/teacherBilling";
import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";

const TEMPLATE_KEY = "grade-9-math-practice-b";
const TEMPLATE_TITLE = "Grade 9 Practice Test - Mathematics - Part B";

function assessmentCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

function authenticatedClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase is not configured.");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  });
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { classroomId } = await request.json().catch(() => ({ classroomId: null })) as { classroomId?: unknown };
    if (typeof classroomId !== "string") return Response.json({ error: "Invalid classroom." }, { status: 400 });

    const admin = adminClient();
    const teacherClient = authenticatedClient(token);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Please sign in again." }, { status: 401 });

    const [{ data: classroom }, { data: membership }] = await Promise.all([
      admin.from("classrooms").select("id,teacher_id").eq("id", classroomId).maybeSingle(),
      admin.from("classroom_teachers").select("teacher_id").eq("classroom_id", classroomId).eq("teacher_id", authData.user.id).maybeSingle(),
    ]);
    if (!classroom || (classroom.teacher_id !== authData.user.id && !membership)) {
      return Response.json({ error: "You do not teach this classroom." }, { status: 403 });
    }

    const { data: existingTemplateCopy, error: existingTemplateError } = await admin
      .from("assessments")
      .select("id")
      .eq("classroom_id", classroomId)
      .eq("template_key", TEMPLATE_KEY)
      .limit(1)
      .maybeSingle();
    if (!existingTemplateError && existingTemplateCopy) {
      return Response.json({ created: false, assessmentId: existingTemplateCopy.id });
    }

    const { data: protectedTemplate } = await admin
      .from("default_assessment_templates")
      .select("title,description,formula_sheet")
      .eq("template_key", TEMPLATE_KEY)
      .maybeSingle();

    let source = protectedTemplate;
    let questions: Array<{ question_order: number; question_type: string; prompt: string; question_data: unknown }> | null = null;
    if (protectedTemplate) {
      const protectedQuestions = await admin
        .from("default_assessment_template_questions")
        .select("question_order,question_type,prompt,question_data")
        .eq("template_key", TEMPLATE_KEY)
        .order("question_order");
      if (!protectedQuestions.error && protectedQuestions.data?.length) questions = protectedQuestions.data;
    }

    // Compatibility fallback for databases whose protected template tables
    // are empty. The original assessment may have been deleted, so locate the
    // oldest surviving complete copy by its canonical title instead of ID.
    if (!source || !questions?.length) {
      const sourceResult = await admin
        .from("assessments")
        .select("id,title,description,formula_sheet")
        .eq("title", TEMPLATE_TITLE)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!source && sourceResult.data) source = sourceResult.data;
      if (sourceResult.data?.id) {
        const questionResult = await admin
          .from("questions")
          .select("question_order,question_type,prompt,question_data")
          .eq("assessment_id", sourceResult.data.id)
          .order("question_order");
        if (!questions?.length && !questionResult.error && questionResult.data?.length) questions = questionResult.data;
      }
    }

    if (!source || !questions?.length) return Response.json({ error: "The example assessment template is unavailable." }, { status: 503 });

    const { data: existingTitleCopy } = await admin
      .from("assessments")
      .select("id")
      .eq("classroom_id", classroomId)
      .eq("title", source.title)
      .limit(1)
      .maybeSingle();
    if (existingTitleCopy) return Response.json({ created: false, assessmentId: existingTitleCopy.id });

    // Use the teacher-scoped client for writes so database ownership triggers
    // receive the authenticated teacher's auth.uid().
    const { data: copy, error: copyError } = await teacherClient.from("assessments").insert({
      teacher_id: classroom.teacher_id,
      classroom_id: classroomId,
      title: source.title,
      description: source.description || "An editable example assessment. You can change or delete it.",
      formula_sheet: source.formula_sheet || {},
      assessment_code: assessmentCode(),
      is_published: false,
      ...(protectedTemplate ? { template_key: TEMPLATE_KEY } : {}),
    }).select("id").single();
    if (copyError || !copy) return Response.json({ error: copyError?.message || "Could not create the example assessment." }, { status: 500 });

    const { error: insertError } = await teacherClient.from("questions").insert(
      questions.map((question) => ({ ...question, assessment_id: copy.id })),
    );
    if (insertError) {
      await admin.from("assessments").delete().eq("id", copy.id);
      return Response.json({ error: insertError.message }, { status: 500 });
    }
    return Response.json({ created: true, assessmentId: copy.id });
  } catch (error) {
    console.error("Default assessment creation failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return Response.json({ error: "Could not create the example assessment." }, { status: 500 });
  }
}
