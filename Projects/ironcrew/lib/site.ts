type SiteEnv = Record<string, string | undefined>;

/** Canonical origin for metadata. Prefers the customer domain over a hardcoded host. */
export function siteUrl(env: SiteEnv = process.env) {
  const configured = trimUrl(env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercelHost = env.VERCEL_ENV === "production"
    ? trimUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ?? trimUrl(env.VERCEL_URL)
    : trimUrl(env.VERCEL_URL) ?? trimUrl(env.VERCEL_PROJECT_PRODUCTION_URL);

  if (vercelHost) return withHttps(vercelHost);
  return "http://localhost:3000";
}

function trimUrl(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/$/, "");
  return trimmed ? trimmed : null;
}

function withHttps(value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}
