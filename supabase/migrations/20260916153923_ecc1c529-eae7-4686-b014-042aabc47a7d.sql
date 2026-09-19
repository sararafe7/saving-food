revoke all on function public.has_role(uuid, public.app_role) from anon;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.update_updated_at_column() from anon;
revoke all on function public.update_updated_at_column() from public;