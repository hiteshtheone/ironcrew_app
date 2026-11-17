import { reportError } from "@/lib/observability/report-error";

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string },
) {
  reportError(error, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
  });
}
