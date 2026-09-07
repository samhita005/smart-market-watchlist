/*
# Smart Market Watchlist — Initial Schema (re-apply with fixed seed)

Creates the full data model for a multi-user "Smart Market Watchlist" app.
Idempotent — safe to re-run.
*/

CREATE TABLE IF NOT EXISTS stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text UNIQUE NOT NULL,
  name text NOT NULL,
  sector text,
  last_price numeric NOT NULL DEFAULT 0,
  last_price_change numeric NOT NULL DEFAULT 0,
  last_price_change_pct numeric NOT NULL DEFAULT 0,
  last_updated timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_stocks" ON stocks;
CREATE POLICY "anon_read_stocks" ON stocks FOR SELECT
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  close numeric NOT NULL,
  change numeric NOT NULL DEFAULT 0,
  change_pct numeric NOT NULL DEFAULT 0,
  recorded_at date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (stock_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_stock_date
  ON price_snapshots (stock_id, recorded_at DESC);

ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_snapshots" ON price_snapshots;
CREATE POLICY "anon_read_snapshots" ON price_snapshots FOR SELECT
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  note text,
  alert_above numeric,
  alert_below numeric,
  last_visited_at timestamptz,
  UNIQUE (user_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items (user_id);

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_watchlist" ON watchlist_items;
CREATE POLICY "select_own_watchlist" ON watchlist_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_watchlist" ON watchlist_items;
CREATE POLICY "insert_own_watchlist" ON watchlist_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_watchlist" ON watchlist_items;
CREATE POLICY "update_own_watchlist" ON watchlist_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_watchlist" ON watchlist_items;
CREATE POLICY "delete_own_watchlist" ON watchlist_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_last_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_last_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_last_seen" ON user_last_seen;
CREATE POLICY "select_own_last_seen" ON user_last_seen FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_last_seen" ON user_last_seen;
CREATE POLICY "insert_own_last_seen" ON user_last_seen FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_last_seen" ON user_last_seen;
CREATE POLICY "update_own_last_seen" ON user_last_seen FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_last_seen" ON user_last_seen;
CREATE POLICY "delete_own_last_seen" ON user_last_seen FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- SEED: 20 stocks
INSERT INTO stocks (ticker, name, sector, last_price, last_price_change, last_price_change_pct, last_updated)
VALUES
  ('AAPL', 'Apple Inc.', 'Technology', 0, 0, 0, now()),
  ('MSFT', 'Microsoft Corp.', 'Technology', 0, 0, 0, now()),
  ('GOOGL', 'Alphabet Inc.', 'Technology', 0, 0, 0, now()),
  ('AMZN', 'Amazon.com Inc.', 'Consumer Cyclical', 0, 0, 0, now()),
  ('NVDA', 'NVIDIA Corp.', 'Technology', 0, 0, 0, now()),
  ('META', 'Meta Platforms Inc.', 'Technology', 0, 0, 0, now()),
  ('TSLA', 'Tesla Inc.', 'Consumer Cyclical', 0, 0, 0, now()),
  ('JPM', 'JPMorgan Chase & Co.', 'Financials', 0, 0, 0, now()),
  ('V', 'Visa Inc.', 'Financials', 0, 0, 0, now()),
  ('JNJ', 'Johnson & Johnson', 'Healthcare', 0, 0, 0, now()),
  ('WMT', 'Walmart Inc.', 'Consumer Defensive', 0, 0, 0, now()),
  ('PG', 'Procter & Gamble Co.', 'Consumer Defensive', 0, 0, 0, now()),
  ('MA', 'Mastercard Inc.', 'Financials', 0, 0, 0, now()),
  ('HD', 'Home Depot Inc.', 'Consumer Cyclical', 0, 0, 0, now()),
  ('KO', 'Coca-Cola Co.', 'Consumer Defensive', 0, 0, 0, now()),
  ('PFE', 'Pfizer Inc.', 'Healthcare', 0, 0, 0, now()),
  ('DIS', 'Walt Disney Co.', 'Communication Services', 0, 0, 0, now()),
  ('NFLX', 'Netflix Inc.', 'Communication Services', 0, 0, 0, now()),
  ('INTC', 'Intel Corp.', 'Technology', 0, 0, 0, now()),
  ('CSCO', 'Cisco Systems Inc.', 'Technology', 0, 0, 0, now())
ON CONFLICT (ticker) DO NOTHING;

-- Generate 90 days of price history per stock using geometric random walk
DO $$
DECLARE
  s RECORD;
  base_price numeric;
  volatility numeric;
  drift numeric;
  cur_price numeric;
  prev_price numeric;
  d integer;
  rec_date date;
  chg numeric;
  chg_pct numeric;
  seed_val integer;
  norm_seed numeric;
BEGIN
  FOR s IN SELECT id, ticker FROM stocks LOOP
    seed_val := abs(hashtext(s.ticker));
    base_price := 50 + (seed_val % 350);
    volatility := 0.015 + ((seed_val % 30) / 1000.0);
    drift := 0.0005 + ((seed_val % 20) / 10000.0);

    cur_price := base_price;
    prev_price := base_price;

    FOR d IN 1..90 LOOP
      rec_date := (CURRENT_DATE - (90 - d))::date;
      -- normalize seed to [-1, 1] range
      norm_seed := ((seed_val + d) % 999983) / 499991.5 - 1.0;
      PERFORM setseed(norm_seed);
      cur_price := prev_price * (1 + drift + volatility * (random() - 0.5) * 2);
      chg := cur_price - prev_price;
      chg_pct := CASE WHEN prev_price <> 0 THEN (chg / prev_price) * 100 ELSE 0 END;

      INSERT INTO price_snapshots (stock_id, close, change, change_pct, recorded_at)
      VALUES (s.id, round(cur_price, 2), round(chg, 2), round(chg_pct, 2), rec_date)
      ON CONFLICT (stock_id, recorded_at) DO NOTHING;

      prev_price := cur_price;
    END LOOP;

    UPDATE stocks
    SET last_price = round(cur_price, 2),
        last_price_change = round(chg, 2),
        last_price_change_pct = round(chg_pct, 2),
        last_updated = now()
    WHERE id = s.id;
  END LOOP;
END $$;
