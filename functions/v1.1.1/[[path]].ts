/**
 * Proxy for the legacy v1.1.1 build.
 *
 * Forwards every request under `/v1.1.1/*` on this project to the
 * frozen legacy Pages project, so both versions share the same
 * origin (and therefore the same `localStorage`).
 *
 * The legacy project must be built with Vite `base: "/v1.1.1/"` so that
 * its asset URLs already include the `/v1.1.1/` prefix; the path is
 * forwarded verbatim.
 */

const LEGACY_ORIGIN = "https://apt-ranker-2183-v1-1-1.pages.dev";

export const onRequest: PagesFunction = async ({ request }) => {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, LEGACY_ORIGIN);

  // Strip hop-by-hop headers Cloudflare doesn't want us to forward.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });

  // Pass the response through untouched. Asset URLs are already absolute
  // paths starting with `/v1.1.1/` thanks to the build-time base, so no
  // body rewriting is needed.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};
