-- Public profile: username and/or linked web3 wallet (no email)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,24}$'),
  wallet_address text UNIQUE CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- One-time sign-in challenges for wallet login (server only)
CREATE TABLE public.auth_nonces (
  nonce text PRIMARY KEY,
  address text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_nonces TO service_role;
ALTER TABLE public.auth_nonces ENABLE ROW LEVEL SECURITY;

-- Mining profiles: one per coin/pool/wallet combination
CREATE TABLE public.mining_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Profile',
  coin text NOT NULL DEFAULT 'GYDS',
  algorithm text NOT NULL DEFAULT 'sha256-gyds',
  miner text NOT NULL DEFAULT 'builtin',
  device text NOT NULL DEFAULT 'cpu' CHECK (device IN ('cpu','gpu','asic','browser')),
  pool_url text NOT NULL DEFAULT '',
  wallet_address text NOT NULL DEFAULT '',
  worker_name text NOT NULL DEFAULT '',
  pool_password text NOT NULL DEFAULT 'x',
  mining_mode text NOT NULL DEFAULT 'pool' CHECK (mining_mode IN ('pool','solo')),
  extra_args text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mining_profiles_user_idx ON public.mining_profiles (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mining_profiles TO authenticated;
GRANT ALL ON public.mining_profiles TO service_role;
ALTER TABLE public.mining_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profiles select" ON public.mining_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profiles insert" ON public.mining_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profiles update" ON public.mining_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profiles delete" ON public.mining_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- GYDS-style node endpoints now belong to a profile
ALTER TABLE public.rpc_endpoints ADD COLUMN profile_id uuid REFERENCES public.mining_profiles(id) ON DELETE CASCADE;
GRANT SELECT (profile_id) ON public.rpc_endpoints TO authenticated;
CREATE INDEX rpc_endpoints_profile_idx ON public.rpc_endpoints (profile_id, position);

-- Rigs: servers/PCs/phones running the rig program, or browser tabs
CREATE TABLE public.rigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Rig',
  kind text NOT NULL DEFAULT 'agent' CHECK (kind IN ('agent','browser')),
  token_hash text UNIQUE,
  platform text NOT NULL DEFAULT '',
  hostname text NOT NULL DEFAULT '',
  agent_version text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'offline',
  desired_state text NOT NULL DEFAULT 'stopped' CHECK (desired_state IN ('running','stopped')),
  profile_id uuid REFERENCES public.mining_profiles(id) ON DELETE SET NULL,
  tuning jsonb NOT NULL DEFAULT '{}'::jsonb,
  hardware jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  log text[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rigs_user_idx ON public.rigs (user_id);
GRANT INSERT, UPDATE, DELETE ON public.rigs TO authenticated;
GRANT SELECT (id, user_id, name, kind, platform, hostname, agent_version, status, desired_state, profile_id, tuning, hardware, stats, log, last_seen_at, created_at) ON public.rigs TO authenticated;
GRANT ALL ON public.rigs TO service_role;
ALTER TABLE public.rigs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rigs select" ON public.rigs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own rigs insert" ON public.rigs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rigs update" ON public.rigs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rigs delete" ON public.rigs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Commands queued from the dashboard for a rig to execute
CREATE TABLE public.rig_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rig_id uuid NOT NULL REFERENCES public.rigs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  command text NOT NULL CHECK (command IN ('start','stop','restart','apply_tuning','set_profile')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acked','done','failed')),
  result text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rig_commands_rig_idx ON public.rig_commands (rig_id, status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rig_commands TO authenticated;
GRANT ALL ON public.rig_commands TO service_role;
ALTER TABLE public.rig_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own commands select" ON public.rig_commands FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own commands insert" ON public.rig_commands FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.rigs r WHERE r.id = rig_id AND r.user_id = auth.uid()));
CREATE POLICY "own commands update" ON public.rig_commands FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own commands delete" ON public.rig_commands FOR DELETE TO authenticated USING (auth.uid() = user_id);