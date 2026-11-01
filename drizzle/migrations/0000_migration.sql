-- Per-user miner settings (replaces config.json)
CREATE TABLE public.miner_settings (
  user_id uuid PRIMARY KEY,
  wallet_address text NOT NULL DEFAULT '',
  mining_mode text NOT NULL DEFAULT 'pool' CHECK (mining_mode IN ('pool','solo')),
  worker_name text NOT NULL DEFAULT 'browser-rig',
  threads integer NOT NULL DEFAULT 0 CHECK (threads >= 0 AND threads <= 256),
  overclock numeric NOT NULL DEFAULT 1 CHECK (overclock >= 0.5 AND overclock <= 8),
  batch_size integer NOT NULL DEFAULT 20000 CHECK (batch_size >= 100 AND batch_size <= 10000000),
  batch_delay_ms integer NOT NULL DEFAULT 0 CHECK (batch_delay_ms >= 0 AND batch_delay_ms <= 60000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.miner_settings TO authenticated;
GRANT ALL ON public.miner_settings TO service_role;
ALTER TABLE public.miner_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings select" ON public.miner_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own settings insert" ON public.miner_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settings update" ON public.miner_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settings delete" ON public.miner_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RPC endpoints with failover order (replaces config.rpcEndpoints)
CREATE TABLE public.rpc_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Node',
  url text NOT NULL,
  cf_client_id text NOT NULL DEFAULT '',
  cf_client_secret text NOT NULL DEFAULT '',
  has_cf_secret boolean GENERATED ALWAYS AS (cf_client_secret <> '') STORED,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rpc_endpoints_user_idx ON public.rpc_endpoints (user_id, position);
-- The browser may write the secret but never read it back; only server code reads it.
GRANT INSERT, UPDATE, DELETE ON public.rpc_endpoints TO authenticated;
GRANT SELECT (id, user_id, label, url, cf_client_id, has_cf_secret, position, created_at) ON public.rpc_endpoints TO authenticated;
GRANT ALL ON public.rpc_endpoints TO service_role;
ALTER TABLE public.rpc_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own endpoints select" ON public.rpc_endpoints FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own endpoints insert" ON public.rpc_endpoints FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own endpoints update" ON public.rpc_endpoints FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own endpoints delete" ON public.rpc_endpoints FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Lifetime stats (replaces stats.json)
CREATE TABLE public.miner_stats (
  user_id uuid PRIMARY KEY,
  lifetime_shares bigint NOT NULL DEFAULT 0,
  lifetime_rejected bigint NOT NULL DEFAULT 0,
  lifetime_reward numeric NOT NULL DEFAULT 0,
  lifetime_mining_seconds bigint NOT NULL DEFAULT 0,
  total_sessions integer NOT NULL DEFAULT 0,
  first_started timestamptz,
  last_updated timestamptz
);
GRANT SELECT ON public.miner_stats TO authenticated;
GRANT ALL ON public.miner_stats TO service_role;
ALTER TABLE public.miner_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stats select" ON public.miner_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomic increment for the signed-in user's stats
CREATE OR REPLACE FUNCTION public.record_miner_stats(
  _shares integer DEFAULT 0,
  _rejected integer DEFAULT 0,
  _reward numeric DEFAULT 0,
  _seconds integer DEFAULT 0,
  _new_session boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _shares < 0 OR _rejected < 0 OR _reward < 0 OR _seconds < 0 OR _seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid stats delta';
  END IF;
  INSERT INTO public.miner_stats AS s (user_id, lifetime_shares, lifetime_rejected, lifetime_reward,
    lifetime_mining_seconds, total_sessions, first_started, last_updated)
  VALUES (uid, _shares, _rejected, _reward, _seconds, CASE WHEN _new_session THEN 1 ELSE 0 END,
    CASE WHEN _new_session THEN now() ELSE NULL END, now())
  ON CONFLICT (user_id) DO UPDATE SET
    lifetime_shares = s.lifetime_shares + EXCLUDED.lifetime_shares,
    lifetime_rejected = s.lifetime_rejected + EXCLUDED.lifetime_rejected,
    lifetime_reward = s.lifetime_reward + EXCLUDED.lifetime_reward,
    lifetime_mining_seconds = s.lifetime_mining_seconds + EXCLUDED.lifetime_mining_seconds,
    total_sessions = s.total_sessions + EXCLUDED.total_sessions,
    first_started = COALESCE(s.first_started, EXCLUDED.first_started),
    last_updated = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_miner_stats(integer, integer, numeric, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_miner_stats(integer, integer, numeric, integer, boolean) TO authenticated;