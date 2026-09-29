import type { SupabaseClient } from "@supabase/supabase-js";

const IMAGE_PATH_TO_URL = {
  imagePath: "imageUrl",
  image_path: "image_url",
  backgroundImagePath: "backgroundImageUrl",
  leftPanelImagePath: "leftPanelImageUrl",
} as const;

export const PRIVATE_IMAGE_URL_LIFETIME_SECONDS = 12 * 60 * 60;

function getCanonicalImageUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from("question-images").getPublicUrl(path).data.publicUrl;
}

async function createServerSignedUrls(supabase: SupabaseClient, paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length || !supabase.auth?.getSession) return urls;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return urls;
    const response = await fetch("/api/private-images/sign", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!response.ok) return urls;
    const payload = await response.json() as { urls?: Record<string, string> };
    Object.entries(payload.urls || {}).forEach(([path, url]) => {
      if (paths.includes(path) && url) urls.set(path, url);
    });
  } catch {
    // The direct storage path remains available as a compatibility fallback.
  }
  return urls;
}

export function collectPrivateImagePaths(value: unknown, paths = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPrivateImagePaths(item, paths));
    return paths;
  }
  if (!value || typeof value !== "object") return paths;
  const record = value as Record<string, unknown>;
  Object.keys(IMAGE_PATH_TO_URL).forEach((pathKey) => {
    const path = record[pathKey];
    if (typeof path === "string" && path) paths.add(path);
  });
  Object.values(record).forEach((item) => collectPrivateImagePaths(item, paths));
  return paths;
}

export function applyPrivateImageUrls<T>(value: T, urls: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) return value.map((item) => applyPrivateImageUrls(item, urls)) as T;
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const hydrated: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, item]) => {
    hydrated[key] = applyPrivateImageUrls(item, urls);
  });
  Object.entries(IMAGE_PATH_TO_URL).forEach(([pathKey, urlKey]) => {
    const path = record[pathKey];
    if (typeof path === "string" && path) hydrated[urlKey] = urls.get(path) || "";
  });
  return hydrated as T;
}

export async function createPrivateImageUrl(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from("question-images").createSignedUrl(path, PRIVATE_IMAGE_URL_LIFETIME_SECONDS);
  if (data?.signedUrl) return data.signedUrl;

  const serverUrls = await createServerSignedUrls(supabase, [path]);
  const serverUrl = serverUrls.get(path);
  if (serverUrl) return serverUrl;

  // Public buckets do not always have a SELECT policy because public object
  // URLs do not need one. Keep uploads usable while the private-bucket
  // migration is being rolled out; once private, storage still rejects this
  // URL unless a signed URL was issued above.
  const fallbackUrl = getCanonicalImageUrl(supabase, path);
  if (fallbackUrl) return fallbackUrl;
  throw new Error(error?.message || "Could not authorize this image.");
}

export async function hydratePrivateImageUrls<T>(supabase: SupabaseClient, value: T): Promise<T> {
  const paths = [...collectPrivateImagePaths(value)];
  if (!paths.length) return value;
  const urls = new Map(paths.map((path) => [path, getCanonicalImageUrl(supabase, path)]));
  const { data, error } = await supabase.storage.from("question-images").createSignedUrls(paths, PRIVATE_IMAGE_URL_LIFETIME_SECONDS);
  if (!error) {
    (data || []).forEach((item) => {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    });
  }

  const signedPaths = new Set((data || []).filter((item) => item.path && item.signedUrl).map((item) => item.path as string));
  const unresolvedPaths = paths.filter((path) => !signedPaths.has(path));
  await Promise.all(unresolvedPaths.map(async (path) => {
    try {
      const { data: signedData } = await supabase.storage.from("question-images").createSignedUrl(path, PRIVATE_IMAGE_URL_LIFETIME_SECONDS);
      if (signedData?.signedUrl) urls.set(path, signedData.signedUrl);
    } catch {
      // Keep the canonical fallback for transient or rollout-time failures.
    }
  }));
  const stillUnresolvedPaths = paths.filter((path) => urls.get(path) === getCanonicalImageUrl(supabase, path));
  const serverUrls = await createServerSignedUrls(supabase, stillUnresolvedPaths);
  serverUrls.forEach((url, path) => urls.set(path, url));
  return applyPrivateImageUrls(value, urls);
}
