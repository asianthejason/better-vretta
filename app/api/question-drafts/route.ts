import { adminClient } from "@/lib/teacherBilling";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedTeacher(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const admin = adminClient();
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user) return null;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  return profile?.role === "teacher" ? { admin, userId: auth.user.id } : null;
}

export async function GET(request: Request) {
  try {
    const account = await authenticatedTeacher(request);
    if (!account) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const assessmentId = new URL(request.url).searchParams.get("assessmentId") || "";
    if (!UUID.test(assessmentId)) return Response.json({ error: "Invalid assessment." }, { status: 400 });
    const { data: assessment } = await account.admin.from("assessments").select("id").eq("id", assessmentId).eq("teacher_id", account.userId).maybeSingle();
    if (!assessment) return Response.json({ error: "Assessment not found." }, { status: 404 });
    const { data, error } = await account.admin.from("question_drafts").select("*")
      .eq("assessment_id", assessmentId).eq("owner_id", account.userId).order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ drafts: data || [] });
  } catch (error) {
    console.error("Could not load question drafts:", error);
    return Response.json({ error: "Cloud drafts are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await authenticatedTeacher(request);
    if (!account) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const assessmentId = typeof body.assessment_id === "string" ? body.assessment_id : "";
    const questionId = typeof body.question_id === "string" ? body.question_id : null;
    const status = body.status === "published" ? "published" : body.status === "draft" ? "draft" : null;
    const updatedAt = typeof body.updated_at === "string" && Number.isFinite(Date.parse(body.updated_at)) ? body.updated_at : "";
    if (!UUID.test(id) || !UUID.test(assessmentId) || (questionId && !UUID.test(questionId)) || !status || !updatedAt || !body.snapshot || typeof body.snapshot !== "object") {
      return Response.json({ error: "Invalid draft." }, { status: 400 });
    }
    const { data: assessment } = await account.admin.from("assessments").select("id").eq("id", assessmentId).eq("teacher_id", account.userId).maybeSingle();
    if (!assessment) return Response.json({ error: "Assessment not found." }, { status: 404 });
    if (questionId) {
      const { data: question } = await account.admin.from("questions").select("id").eq("id", questionId).eq("assessment_id", assessmentId).maybeSingle();
      if (!question) return Response.json({ error: "Question not found." }, { status: 404 });
    }
    const { error } = await account.admin.from("question_drafts").upsert({
      id,
      owner_id: account.userId,
      assessment_id: assessmentId,
      question_id: questionId,
      status,
      snapshot: body.snapshot,
      updated_at: updatedAt,
    });
    if (error) throw error;
    return Response.json({ saved: true });
  } catch (error) {
    console.error("Could not save question draft:", error);
    return Response.json({ error: "Cloud draft save is temporarily unavailable." }, { status: 503 });
  }
}
