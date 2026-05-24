// Temporary debug endpoint — no _lib.js imports, just checks env bindings.
// DELETE this file after debugging is done.
export async function onRequestGet(context) {
  const { env } = context;
  return new Response(JSON.stringify({
    hasDB: !!env.DB,
    dbType: typeof env.DB,
    hasSupabaseUrl: !!env.SUPABASE_URL,
    hasSupabaseKey: !!env.SUPABASE_ANON_KEY,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
