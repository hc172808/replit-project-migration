CREATE TABLE public.rig_update_history (
 id uuid PRIMARY KEY,
 rig_id uuid NOT NULL REFERENCES public.rigs(id) ON DELETE CASCADE,
 installed_version text NOT NULL,
 target_version text NOT NULL DEFAULT '',
 result text NOT NULL CHECK (result IN ('installed', 'success', 'failed')),
 message text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rig_update_history TO authenticated;
GRANT ALL ON public.rig_update_history TO service_role;
ALTER TABLE public.rig_update_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read rig update history" ON public.rig_update_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.rigs WHERE rigs.id = rig_update_history.rig_id AND rigs.user_id = auth.uid()));
CREATE INDEX rig_update_history_rig_time ON public.rig_update_history (rig_id, occurred_at DESC);