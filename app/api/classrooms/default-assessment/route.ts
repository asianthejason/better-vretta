import { adminClient } from "@/lib/teacherBilling";

const SOURCE_ASSESSMENT_ID = "9172cd6c-e319-40a3-821e-84a6c365508b";

function assessmentCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { classroomId } = await request.json().catch(() => ({ classroomId: null })) as { classroomId?: unknown };
    if (typeof classroomId !== "string") return Response.json({ error: "Invalid classroom." }, { status: 400 });

    const admin = adminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Please sign in again." }, { status: 401 });

    const [{ data: classroom }, { data: membership }] = await Promise.all([
      admin.from("classrooms").select("id,teacher_id").eq("id", classroomId).maybeSingle(),
      admin.from("classroom_teachers").select("teacher_id").eq("classroom_id", classroomId).eq("teacher_id", authData.user.id).maybeSingle(),
    ]);
    if (!classroom || (classroom.teacher_id !== authData.user.id && !membership)) {
      return Response.json({ error: "You do not teach this classroom." }, { status: 403 });
    }

    const { data: source, error: sourceError } = await admin
      .from("assessments")
      .select("title,description,formula_sheet")
      .eq("id", SOURCE_ASSESSMENT_ID)
      .single();
    if (sourceError || !source) return Response.json({ error: "The example assessment is unavailable." }, { status: 503 });

    const { data: existing } = await admin
      .from("assessments")
      .select("id")
      .eq("classroom_id", classroomId)
      .eq("title", source.title)
      .limit(1)
      .maybeSingle();
    if (existing) return Response.json({ created: false, assessmentId: existing.id });

    const { data: copy, error: copyError } = await admin.from("assessments").insert({
      teacher_id: classroom.teacher_id,
      classroom_id: classroomId,
      title: source.title,
      description: source.description || "An editable example assessment. You can change or delete it.",
      formula_sheet: source.formula_sheet || {},
      assessment_code: assessmentCode(),
      is_published: false,
    }).select("id").single();
    if (copyError || !copy) return Response.json({ error: copyError?.message || "Could not create the example assessment." }, { status: 500 });

    const { data: questions, error: questionError } = await admin
      .from("questions")
      .select("question_order,question_type,prompt,question_data")
      .eq("assessment_id", SOURCE_ASSESSMENT_ID)
      .order("question_order");
    if (questionError || !questions?.length) {
      await admin.from("assessments").delete().eq("id", copy.id);
      return Response.json({ error: "The example questions are unavailable." }, { status: 503 });
    }
    const { error: insertError } = await admin.from("questions").insert(
      questions.map((question) => ({ ...question, assessment_id: copy.id })),
    );
    if (insertError) {
      await admin.from("assessments").delete().eq("id", copy.id);
      return Response.json({ error: insertError.message }, { status: 500 });
    }
    return Response.json({ created: true, assessmentId: copy.id });
  } catch (error) {
    console.error("Default assessment creation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not create the example assessment." }, { status: 500 });
  }
}
