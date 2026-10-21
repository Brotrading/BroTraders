// /admin/login: the data admin's sign-in, the same page as /admin/data (it shows the
// sign-in form when signed out, and moves to /admin/data once signed in).
export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(new Request(new URL("/admin/data", request.url), request));
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex, nofollow");
  return out;
}
