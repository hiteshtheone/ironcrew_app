type ErrorContext = Record<string, string | undefined>;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

/** Log a failure and, when SENTRY_DSN is set, send it to Sentry. */
export function reportError(error: unknown, context: ErrorContext = {}) {
  const message = errorMessage(error);
  console.error(message, context);

  const dsn = process.env.SENTRY_DSN?.trim();
  const target = dsn ? sentryStore(dsn) : null;
  if (!target) return;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const tags = Object.fromEntries(
    Object.entries(context).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  void fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=ironcrew/1.0`,
    },
    body: JSON.stringify({
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      message: { formatted: message },
      tags,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    }),
  }).catch(() => undefined);
}

export function sentryStore(dsn: string) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (url.protocol !== "https:" || !url.username || !projectId) return null;
    return {
      key: decodeURIComponent(url.username),
      url: `${url.protocol}//${url.host}/api/${projectId}/store/`,
    };
  } catch {
    return null;
  }
}
