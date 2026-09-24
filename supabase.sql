create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  code text not null,
  item text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  minimum numeric not null default 10 check (minimum >= 0),
  employee text not null,
  type text not null check (type in ('Entrada', 'Entrega', 'Troca')),
  status text not null default 'Pendente' check (status in ('Pendente', 'Baixado')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.movements enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'user')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy "admin update profiles" on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read movements" on public.movements for select to authenticated using (true);
create policy "authenticated insert movements" on public.movements for insert to authenticated
with check (created_by = auth.uid());
create policy "admin update movements" on public.movements for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admin delete movements" on public.movements for delete to authenticated
using (public.is_admin());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update(role, full_name) on public.profiles to authenticated;
grant select, insert on public.movements to authenticated;
grant update, delete on public.movements to authenticated;

-- Depois de criar seu primeiro usuario em Authentication > Users, promova-o uma unica vez:
-- update public.profiles set role = 'admin' where id = 'UUID_DO_USUARIO';
