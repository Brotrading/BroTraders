// PropAI — Cloudflare Pages Function
// Endpoint: POST /api/propai
// Streams Claude responses for prop firm questions, fed by data/firm-rules.json.
//
// Required env vars (set in Cloudflare Pages → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  — Claude API key

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const MAX_INPUT_CHARS = 1500;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_INSTRUCTIONS = `You are PropAI, the AI assistant for propfirmbro.com — Mike's prop firm comparison site.

Your job: answer trader questions about futures prop firms (rules, pricing, payouts, drawdowns, platforms, comparisons) using ONLY the firm data provided below. If a question is outside this data or about a firm not listed, say so honestly and suggest Mike's Discord (https://discord.gg/brotrading) for personal advice.

TONE:
- Direct, friendly, no-BS — like a trader friend who knows the firms
- Short paragraphs, bullet points when comparing
- Use specific numbers from the data (drawdown amounts, prices, percentages)
- Never make up rules or numbers — if it's not in the data, say "I don't have that info"

AFFILIATE CODES (always promote when recommending a firm):
- When you recommend or describe a firm, include Mike's affiliate code and link from the data
- Format like: "Use code **BRO** for up to 40% off → [Apex link]"
- Don't be salesy — only mention codes when relevant to the answer

CRITICAL RULES:
- Pricing: data shows BROTRADING/BRO coupon prices. Always note "verify on the firm's site for current pricing"
- Never claim trading is risk-free or guaranteed profitable
- If asked which firm is "best", explain it depends on the trader's style and give 2-3 options with trade-offs
- For complex setup/rule questions where the data is incomplete, point to Discord for live help

End every response with a single short follow-up question to keep the conversation going (e.g. "What size account are you considering?" or "Want me to compare these two side-by-side?").

FIRM DATA (source of truth):`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return jsonError("Server not configured: ANTHROPIC_API_KEY missing", 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return jsonError("Body must include non-empty 'messages' array", 400);
  }

  // Validate + trim history
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => {
    if (!m || typeof m.role !== "string" || typeof m.content !== "string") {
      return null;
    }
    if (m.role !== "user" && m.role !== "assistant") return null;
    return { role: m.role, content: m.content.slice(0, MAX_INPUT_CHARS) };
  });
  if (trimmed.some((m) => m === null)) {
    return jsonError("Invalid message format", 400);
  }

  // Load firm data from the same deployment
  const firmDataUrl = new URL("/data/firm-rules.json", request.url);
  const firmRes = await fetch(firmDataUrl);
  if (!firmRes.ok) {
    return jsonError("Could not load firm data", 500);
  }
  const firmJson = await firmRes.text();

  // Build cached system prompt (Anthropic prompt caching — system stays cached for ~5 min,
  // saving ~90% on subsequent requests)
  const systemBlocks = [
    {
      type: "text",
      text: SYSTEM_INSTRUCTIONS + "\n\n```json\n" + firmJson + "\n```",
      cache_control: { type: "ephemeral" },
    },
  ];

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: systemBlocks,
      messages: trimmed,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return jsonError(`Claude API error: ${errText}`, anthropicRes.status);
  }

  // Stream the SSE response straight back to the browser
  return new Response(anthropicRes.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
      ...CORS_HEADERS,
    },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
