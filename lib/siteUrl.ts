const PRODUCTION_ORIGIN = "https://cloneretta.com";

/**
 * Authentication providers must return production users to the canonical
 * domain, even when a deployment is reached through a Vercel preview URL.
 */
export function siteUrl(path: string, browserOrigin: string, environment = process.env.NODE_ENV) {
  const origin = environment === "production" ? PRODUCTION_ORIGIN : browserOrigin;
  return new URL(path, origin).toString();
}
