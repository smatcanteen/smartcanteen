CREATE TABLE IF NOT EXISTS public.platform_state (
  id text PRIMARY KEY DEFAULT 'shared' CHECK (id = 'shared'),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_state (id, data)
VALUES ('shared', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated read platform state"
ON public.platform_state FOR SELECT TO authenticated
USING (true);

CREATE POLICY "staff and agents update platform state"
ON public.platform_state FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin') OR
  private.has_role(auth.uid(), 'support') OR
  private.has_role(auth.uid(), 'finance') OR
  private.has_role(auth.uid(), 'agent')
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin') OR
  private.has_role(auth.uid(), 'support') OR
  private.has_role(auth.uid(), 'finance') OR
  private.has_role(auth.uid(), 'agent')
);
