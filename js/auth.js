// Auth layer wrapping Supabase JS v2.
// Exposes window.BroAuth with:
//   .client            — raw supabase client
//   .ready             — Promise that resolves once initial session is loaded
//   .getSession()      — current session (null if anon)
//   .getUser()         — convenience: session?.user || null
//   .onChange(fn)      — subscribe to auth state changes
//   .signUp({email,password,referralCode})
//   .signIn({email,password})
//   .signInWithGoogle()
//   .signOut()
//   .syncToD1()        — POST /api/rewards/sync (idempotent; called after every signin)
//
// Discord OAuth and future providers are added by calling .signInWithProvider("discord").

(() => {
  if (window.BroAuth) return; // Already initialized — guard against double-loading via head.js

  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

  async function loadSupabase() {
    // Bail out after 8 s so a slow/down CDN never hangs the whole page.
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("[auth] Supabase CDN timeout")), 8000)
    );
    const mod = await Promise.race([import(CDN), timeout]);
    return mod.createClient;
  }

  const cfg = window.SUPABASE_CONFIG;
  if (!cfg) {
    console.error("[auth] SUPABASE_CONFIG missing — include js/supabase-config.js before js/auth.js");
    return;
  }

  const subscribers = new Set();
  let client = null;
  let currentSession = null;

  // Resolve when the initial session has loaded (from URL hash, cookies, etc).
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  function notify() {
    subscribers.forEach((fn) => {
      try {
        fn(currentSession);
      } catch (e) {
        console.error("[auth] subscriber threw:", e);
      }
    });
  }

  async function syncToD1() {
    if (!currentSession) return null;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("/api/rewards/sync", {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({
          referral_code: localStorage.getItem("bro_pending_referral") || null,
        }),
      });
      clearTimeout(tid);
      if (res.ok) {
        // Referral code used — clear it.
        localStorage.removeItem("bro_pending_referral");
        return await res.json();
      }
      console.warn("[auth] /api/rewards/sync returned", res.status);
    } catch (e) {
      clearTimeout(tid);
      console.error("[auth] sync failed:", e);
    }
    return null;
  }

  async function init() {
    try {
      const createClient = await loadSupabase();
      client = createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });

      const { data } = await client.auth.getSession();
      currentSession = data?.session || null;

      // Store user ID in a simple key so click-attribution.js can read it without
      // having to parse the Supabase token format (which varies across SDK versions).
      if (currentSession?.user?.id) {
        localStorage.setItem("bro_uid", currentSession.user.id);
      }

      client.auth.onAuthStateChange(async (event, session) => {
        currentSession = session || null;
        if (currentSession?.user?.id) {
          localStorage.setItem("bro_uid", currentSession.user.id);
        } else if (event === "SIGNED_OUT") {
          localStorage.removeItem("bro_uid");
        }
        // Sync on first sign-in or token refresh.
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await syncToD1();
        }
        notify();
      });

      // Fire initial sync if already signed in.
      if (currentSession) {
        await syncToD1();
      }
    } catch (e) {
      console.error("[auth] init failed:", e);
    } finally {
      resolveReady();
      notify();
    }
  }

  function captureReferralFromURL() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("bro_pending_referral", ref);
    }
  }

  captureReferralFromURL();

  window.BroAuth = {
    get client() {
      return client;
    },
    ready,
    getSession: () => currentSession,
    getUser: () => currentSession?.user || null,
    onChange(fn) {
      subscribers.add(fn);
      // Fire once with current value so subscribers don't have to remember.
      try {
        fn(currentSession);
      } catch (e) {}
      return () => subscribers.delete(fn);
    },
    async signUp({ email, password, displayName }) {
      await ready;
      return client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || null },
          emailRedirectTo: `${window.location.origin}/rewards/account.html`,
        },
      });
    },
    async signIn({ email, password }) {
      await ready;
      return client.auth.signInWithPassword({ email, password });
    },
    async signInWithGoogle() {
      return this.signInWithProvider("google");
    },
    async signInWithProvider(provider) {
      await ready;
      return client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/rewards/account.html` },
      });
    },
    async signOut() {
      await ready;
      const r = await client.auth.signOut();
      currentSession = null;
      notify();
      return r;
    },
    async authedFetch(input, init = {}) {
      await ready;
      if (!currentSession) throw new Error("Not signed in");
      const headers = new Headers(init.headers || {});
      headers.set("Authorization", `Bearer ${currentSession.access_token}`);
      return fetch(input, { ...init, headers });
    },
    syncToD1,
  };

  init();
})();
