CREATE TABLE public.volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.volunteers TO anon, authenticated;
GRANT ALL ON public.volunteers TO service_role;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "volunteers_read_all" ON public.volunteers FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.surplus_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  food_description text NOT NULL,
  quantity text NOT NULL,
  ready_time timestamptz NOT NULL,
  pickup_location text NOT NULL,
  status text NOT NULL DEFAULT 'posted',
  volunteer_id uuid REFERENCES public.volunteers(id) ON DELETE SET NULL,
  coordinator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
);
GRANT SELECT (id, restaurant_name, food_description, quantity, ready_time, pickup_location, status, volunteer_id, created_at, assigned_at, picked_up_at, delivered_at) ON public.surplus_posts TO anon, authenticated;
GRANT INSERT (restaurant_name, food_description, quantity, ready_time, pickup_location) ON public.surplus_posts TO anon, authenticated;
GRANT UPDATE (status, volunteer_id, assigned_at, picked_up_at, delivered_at) ON public.surplus_posts TO anon, authenticated;
GRANT ALL ON public.surplus_posts TO service_role;
ALTER TABLE public.surplus_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_read_all" ON public.surplus_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "posts_insert_all" ON public.surplus_posts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "posts_update_all" ON public.surplus_posts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.coordinator_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.coordinator_access TO service_role;
ALTER TABLE public.coordinator_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.coordinator_access (pin) VALUES ('1234');
INSERT INTO public.volunteers (name, phone) VALUES
  ('أحمد الخالدي', '0501234567'),
  ('فاطمة الزهراء', '0559876543'),
  ('يوسف بن علي', '0533344556');

INSERT INTO public.surplus_posts (restaurant_name, food_description, quantity, ready_time, pickup_location, status)
VALUES ('مطعم البركة', '20 حصة أرز مع دجاج', '20 حصة', now() + interval '2 hours', 'شارع الملك فهد، حي النزهة', 'posted');