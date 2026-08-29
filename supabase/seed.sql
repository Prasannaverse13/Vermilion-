-- =============================================================
-- Vermilion — Demo data seeder (Supabase SQL Editor compatible)
-- =============================================================
-- User UUID already filled in below (1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87).
-- Just copy the whole file, paste into Supabase SQL editor, Run.
--
-- To seed a different user, get their user_id from:
--   Supabase Dashboard -> Authentication -> Users -> click the
--   user -> copy the "User UID" field.
--   Then find-and-replace the UUID below with theirs.
-- =============================================================

-- Decisions
insert into public.decisions (user_id, symbol, action, refused, confidence, threshold, reasoning, sources, qty, price, created_at) values
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'NVDA', 'refuse', true, 42, 60,
   'Earnings in 2 days, implied vol 68%, no fresh catalyst since last print. Confidence 42% — below 60% threshold. Wait for post-earnings re-evaluation.',
   '[{"tag":"REUTERS","text":"NVDA earnings in 2 days, AI capex intact"},{"tag":"SEC 10-Q","text":"Data center revenue +112% YoY"},{"tag":"BLOOMBERG","text":"Implied vol 68% (90th %ile)"},{"tag":"TECHNICAL","text":"RSI 71, above 50-day MA by 12%"}]'::jsonb,
   null, null, now() - interval '2 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'VTI', 'buy', false, 78, 60,
   'VIX dropped 12% overnight, broad-market trend positive, diversification rationale vs single-name exposure. Confidence 78%. Position sized at 4% of equity.',
   '[{"tag":"REUTERS","text":"VIX down 12% overnight"},{"tag":"MACRO","text":"Broad market trend positive"},{"tag":"TECHNICAL","text":"Above 50-day MA"},{"tag":"DIVERSIFICATION","text":"Single-name exposure risk"}]'::jsonb,
   10, 244.30, now() - interval '5 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'META', 'refuse', true, 38, 60,
   'Short thesis depends on capex miss, but Q3 commentary was constructive. Confidence 38%. Re-evaluate after Q4 print.',
   '[{"tag":"EARNINGS","text":"Q3 commentary constructive"},{"tag":"TECHNICAL","text":"Above 200-day MA"},{"tag":"FUNDAMENTAL","text":"Capex guidance raised"}]'::jsonb,
   null, null, now() - interval '6 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'AAPL', 'sell', false, 72, 60,
   'Position hit 8% gain target, RSI at 78 (overbought). Trimming to lock in profits; keeping core 3-share position.',
   '[{"tag":"TECHNICAL","text":"RSI 78 overbought"},{"tag":"TARGET","text":"8% gain target hit"},{"tag":"RISK","text":"Lock in profits"}]'::jsonb,
   5, 184.20, now() - interval '1 day 2 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'TSLA', 'refuse', true, 31, 60,
   'Already up 14% this week, no defined entry plan, signal looks FOMO-driven. Confidence 31%. Will revisit at a pullback to 20-day EMA.',
   '[{"tag":"TECHNICAL","text":"Up 14% this week"},{"tag":"FOMO","text":"No defined entry plan"},{"tag":"EMA","text":"Pullback to 20-day EMA needed"}]'::jsonb,
   null, null, now() - interval '1 day 6 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'NVDA', 'refuse', true, 45, 60,
   'Position size would exceed 8% concentration cap. Sizing constraint, not conviction issue. Confidence 45%.',
   '[{"tag":"RISK","text":"Position size cap 8%"},{"tag":"CONVICTION","text":"Conviction high but size capped"}]'::jsonb,
   null, null, now() - interval '2 days 1 hour'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'MSFT', 'buy', false, 81, 60,
   'Cloud revenue beat consensus, Azure growth re-accelerating, AI services now a meaningful contributor. Confidence 81%.',
   '[{"tag":"EARNINGS","text":"Cloud beat consensus"},{"tag":"AZURE","text":"Growth re-accelerating"},{"tag":"AI","text":"AI services material"}]'::jsonb,
   2, 412.50, now() - interval '2 days 4 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'GOOGL', 'refuse', true, 44, 60,
   'Search ad spend softening, but YouTube and Cloud strong. Mixed signals. Confidence 44%.',
   '[{"tag":"SEARCH","text":"Ad spend softening"},{"tag":"YOUTUBE","text":"Strong"},{"tag":"CLOUD","text":"Strong"},{"tag":"MIXED","text":"Mixed signals"}]'::jsonb,
   null, null, now() - interval '3 days'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'SPY', 'sell', false, 75, 60,
   'Hit 4% gain target on defensive hedge, rolling into 2-month put spreads for continued downside protection.',
   '[{"tag":"TARGET","text":"4% gain target hit"},{"tag":"HEDGE","text":"Rolling into put spreads"}]'::jsonb,
   3, 552.18, now() - interval '3 days 3 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'AMZN', 'refuse', true, 41, 60,
   'Retail margin compression, AWS growth slowing. Not enough edge despite low valuation. Confidence 41%.',
   '[{"tag":"RETAIL","text":"Margin compression"},{"tag":"AWS","text":"Growth slowing"},{"tag":"VALUATION","text":"Low but no edge"}]'::jsonb,
   null, null, now() - interval '4 days'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'JPM', 'refuse', true, 39, 60,
   'Net interest margin guidance lower than consensus. Pre-earnings risk too high. Confidence 39%.',
   '[{"tag":"EARNINGS","text":"NIM guidance low"},{"tag":"RISK","text":"Pre-earnings volatility"}]'::jsonb,
   null, null, now() - interval '4 days 6 hours');

-- Open positions
insert into public.positions (user_id, symbol, name, qty, entry_price, current_price, opened_at) values
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'VTI',  'Vanguard Total Stock Market ETF', 10, 244.30, 246.80, now() - interval '5 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'AAPL', 'Apple Inc.',                       3,  178.40, 181.20, now() - interval '1 day 2 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'MSFT', 'Microsoft Corporation',            2,  412.50, 408.10, now() - interval '2 days 4 hours'),
  ('1bb5fe8b-0b2a-47bc-a9ac-f8443c343d87', 'SPY',  'SPDR S&P 500 ETF',                 3,  552.18, 555.40, now() - interval '3 days 3 hours');
