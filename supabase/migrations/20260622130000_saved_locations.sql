-- Sprint 6.4: Saved Locations
-- Allows customers to save frequently used addresses for faster booking.

CREATE TABLE IF NOT EXISTS public.saved_locations (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text             NOT NULL,
  address     text             NOT NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  is_default  boolean          NOT NULL DEFAULT false,
  created_at  timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_sl_customer_id ON public.saved_locations (customer_id);
CREATE INDEX idx_sl_created_at  ON public.saved_locations (created_at);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

-- Customer: read own saved locations
CREATE POLICY "sl_customer_select"
  ON public.saved_locations
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- Customer: insert own saved locations
CREATE POLICY "sl_customer_insert"
  ON public.saved_locations
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Customer: update own saved locations
CREATE POLICY "sl_customer_update"
  ON public.saved_locations
  FOR UPDATE TO authenticated
  USING  (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Customer: delete own saved locations
CREATE POLICY "sl_customer_delete"
  ON public.saved_locations
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());
