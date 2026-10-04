import { adminClient } from "@/lib/teacherBilling";

// Recover uploads that predate the image library or were uploaded before an
// interrupted save. Only scan folders belonging to this teacher's assessments.
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: "Please sign in." }, { status: 401 });
    const ownerId = auth.user.id;
    const { data: profile } = await admin.from("profiles").select("role").eq("id", ownerId).single();
    if (profile?.role !== "teacher") return Response.json({ error: "Teacher access required." }, { status: 403 });
    const folders: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("assessments").select("id").eq("teacher_id", ownerId).order("id").range(offset, offset + 499);
      if (error) throw error;
      folders.push(...(data || []).map(row => row.id));
      if (!data || data.length < 500) break;
    }
    const bucket = admin.storage.from("question-images");
    for (const folder of folders) {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await bucket.list(folder, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw error;
        const rows = [];
        for (const object of data || []) {
          const path = `${folder}/${object.name}`;
          if (!object.id) { folders.push(path); continue; }
          rows.push({ owner_id: ownerId, image_path: path, image_url: bucket.getPublicUrl(path).data.publicUrl, label: object.name, created_at: object.created_at });
        }
        if (rows.length) {
          const { error: saveError } = await admin.from("account_images").upsert(rows, { onConflict: "owner_id,image_path", ignoreDuplicates: true });
          if (saveError) throw saveError;
        }
        if (!data || data.length < 100) break;
      }
    }
    return Response.json({ recovered: true });
  } catch {
    return Response.json({ error: "Could not recover past image uploads." }, { status: 500 });
  }
}
