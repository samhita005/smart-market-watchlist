// Market data edge function.
// POST: Generates a new trading day for all stocks via geometric random walk.
// GET: Returns the latest prices + recent history for the caller's watchlist.
//
// Uses the service-role key (bypasses RLS) to update shared stock data.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (req.method === "POST") {
      return await advanceMarket(admin);
    }

    if (req.method === "GET") {
      return await getMarketData(req, admin);
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// POST /functions/v1/market-data
// Advance the market by one trading day for all stocks.
// Each stock gets a new close based on its last close + random walk.
async function advanceMarket(admin: ReturnType<typeof createClient>) {
  const { data: stocks, error: stockErr } = await admin
    .from("stocks")
    .select("id, ticker, last_price");

  if (stockErr) throw stockErr;
  if (!stocks || stocks.length === 0) {
    return new Response(JSON.stringify({ updated: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;

  for (const stock of stocks) {
    const prev = Number(stock.last_price);
    if (prev <= 0) continue;

    const seed = Math.abs(hashString(stock.ticker)) + Date.now() % 100000;
    const vol = 0.015 + ((seed % 30) / 1000);
    const drift = 0.0005 + ((seed % 20) / 10000);

    // Pseudo-random daily return
    const rand = Math.random();
    const newPrice = prev * (1 + drift + vol * (rand - 0.5) * 2);
    const chg = newPrice - prev;
    const chgPct = (chg / prev) * 100;
    const rounded = Math.round(newPrice * 100) / 100;

    // Insert snapshot for today (skip if already exists)
    const { error: snapErr } = await admin
      .from("price_snapshots")
      .upsert(
        {
          stock_id: stock.id,
          close: rounded,
          change: Math.round(chg * 100) / 100,
          change_pct: Math.round(chgPct * 100) / 100,
          recorded_at: today,
        },
        { onConflict: "stock_id,recorded_at" }
      );

    if (snapErr) throw snapErr;

    // Update stock's latest price
    const { error: updErr } = await admin
      .from("stocks")
      .update({
        last_price: rounded,
        last_price_change: Math.round(chg * 100) / 100,
        last_price_change_pct: Math.round(chgPct * 100) / 100,
        last_updated: new Date().toISOString(),
      })
      .eq("id", stock.id);

    if (updErr) throw updErr;
    updated++;
  }

  return new Response(JSON.stringify({ updated, date: today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// GET /functions/v1/market-data?stock_ids=id1,id2,...
// Returns latest stock data + 30-day history for the requested stocks.
async function getMarketData(
  req: Request,
  admin: ReturnType<typeof createClient>
) {
  const url = new URL(req.url);
  const stockIdsParam = url.searchParams.get("stock_ids") || "";
  const stockIds = stockIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let stockQuery = admin.from("stocks").select("*");
  if (stockIds.length > 0) {
    stockQuery = stockQuery.in("id", stockIds);
  }
  const { data: stocks, error: stockErr } = await stockQuery;

  if (stockErr) throw stockErr;

  // Fetch 30-day history for each stock
  const history: Record<string, Array<{ date: string; close: number; change: number; change_pct: number }>> = {};
  for (const stock of stocks || []) {
    const { data: snaps, error: snapErr } = await admin
      .from("price_snapshots")
      .select("close, change, change_pct, recorded_at")
      .eq("stock_id", stock.id)
      .order("recorded_at", { ascending: true })
      .limit(30);

    if (snapErr) throw snapErr;

    history[stock.id] = (snaps || []).map((s) => ({
      date: s.recorded_at,
      close: Number(s.close),
      change: Number(s.change),
      change_pct: Number(s.change_pct),
    }));
  }

  return new Response(
    JSON.stringify({
      stocks: (stocks || []).map((s) => ({
        ...s,
        last_price: Number(s.last_price),
        last_price_change: Number(s.last_price_change),
        last_price_change_pct: Number(s.last_price_change_pct),
      })),
      history,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
