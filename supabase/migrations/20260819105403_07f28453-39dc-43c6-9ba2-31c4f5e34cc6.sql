REVOKE ALL ON public.surplus_posts FROM anon, authenticated;
GRANT SELECT (id, restaurant_name, food_description, quantity, ready_time, pickup_location, status, volunteer_id, created_at, assigned_at, picked_up_at, delivered_at) ON public.surplus_posts TO anon, authenticated;
GRANT INSERT (restaurant_name, food_description, quantity, ready_time, pickup_location) ON public.surplus_posts TO anon, authenticated;
GRANT UPDATE (status, volunteer_id, assigned_at, picked_up_at, delivered_at) ON public.surplus_posts TO anon, authenticated;