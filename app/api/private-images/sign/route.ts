import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { adminClient } from "@/lib/teacherBilling";
import { collectPrivateImagePaths, PRIVATE_IMAGE_URL_LIFETIME_SECONDS } from "@/lib/privateImageUrls";

const BUCKET = "question-images";
const MAX_PATHS = 200;

function validPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !value.split("/").includes("..");
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

    const body = await request.json().catch(() => null) as { paths?: unknown } | null;
    if (!Array.isArray(body?.paths) || body.paths.length > MAX_PATHS || !body.paths.every(validPath)) {
      return Response.json({ error: "Invalid image paths." }, { status: 400 });
    }
    const paths = [...new Set(body.paths)];
    if (!paths.length) return Response.json({ urls: {} });

    const admin = adminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Please sign in again." }, { status: 401 });

    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).single();
    const authorized = new Set<string>();

    if (profile?.role === "teacher") {
      const [{ data: libraryRows }, { data: assessments }] = await Promise.all([
        admin.from("account_images").select("image_path").eq("owner_id", authData.user.id).in("image_path", paths),
        admin.from("assessments").select("id").eq("teacher_id", authData.user.id),
      ]);
      (libraryRows || []).forEach((row) => authorized.add(row.image_path));
      const ownedAssessmentIds = new Set((assessments || []).map((assessment) => assessment.id));
      paths.forEach((path) => {
        const assessmentId = path.split("/", 1)[0];
        if (ownedAssessmentIds.has(assessmentId)) authorized.add(path);
      });
    } else if (profile?.role === "student") {
      // Question RLS already limits this client to assessments currently
      // available to the student. Only paths referenced by those questions
      // can be signed.
      const client = authenticatedClient(token);
      const { data: questions, error } = await client.from("questions").select("question_data");
      if (error) return Response.json({ error: "Images are unavailable." }, { status: 403 });
      const referencedPaths = collectPrivateImagePaths(questions || []);
      paths.forEach((path) => {
        if (referencedPaths.has(path)) authorized.add(path);
      });
      await Promise.all(paths.filter((path) => !authorized.has(path)).map(async (path) => {
        const { data: allowed, error: accessError } = await client.rpc("student_can_read_question_image", { target_path: path });
        if (!accessError && allowed === true) authorized.add(path);
      }));
    }

    const allowedPaths = paths.filter((path) => authorized.has(path));
    if (!allowedPaths.length) return Response.json({ urls: {} }, { headers: { "Cache-Control": "no-store" } });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(allowedPaths, PRIVATE_IMAGE_URL_LIFETIME_SECONDS);
    if (error) return Response.json({ error: "Images are temporarily unavailable." }, { status: 503 });

    const urls = Object.fromEntries((data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl]] : []));
    return Response.json({ urls }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Private image signing failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Images are temporarily unavailable." }, { status: 500 });
  }
}
