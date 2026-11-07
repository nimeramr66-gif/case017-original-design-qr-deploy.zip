-- THE LAST SHADOW — إضافة أكواد 6 أرقام + المتجر + الطلبات + المحادثات
-- ترقية إضافية لا تحذف أي بيانات قديمة. نفّذها بعد أخذ نسخة احتياطية من Supabase SQL Editor.
begin;

alter table public.profiles add column if not exists full_name text;
alter table public.serial_codes add column if not exists case_code text;
alter table public.serial_codes add column if not exists case_user_id uuid references auth.users(id) on delete set null;
alter table public.serial_codes add column if not exists used_at timestamptz;
create unique index if not exists serial_codes_case_code_uq on public.serial_codes(case_code) where case_code is not null;

create table if not exists public.case_code_attempts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);

create or replace function public.claim_case_code(p_code text,p_full_name text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_row public.serial_codes%rowtype; v_count integer; v_start timestamptz;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'الكود يجب أن يتكون من 6 أرقام'; end if;
  insert into public.case_code_attempts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select attempts,window_started_at into v_count,v_start from public.case_code_attempts where user_id=auth.uid() for update;
  if v_start < now()-interval '15 minutes' then
    update public.case_code_attempts set attempts=0,window_started_at=now() where user_id=auth.uid(); v_count:=0;
  end if;
  if v_count >= 10 then raise exception 'محاولات كثيرة. حاول بعد 15 دقيقة.'; end if;
  update public.case_code_attempts set attempts=attempts+1 where user_id=auth.uid();
  select * into v_row from public.serial_codes where case_code=p_code for update;
  if not found then return jsonb_build_object('success',false,'message','كود القضية غير صحيح.'); end if;
  if v_row.status <> 'active' or v_row.case_user_id is not null then
    return jsonb_build_object('success',false,'message','تم استخدام هذا الكود أو إلغاؤه مسبقاً.');
  end if;
  update public.serial_codes set status='used',case_user_id=auth.uid(),used_by_name=left(trim(p_full_name),80),used_at=now()
    where id=v_row.id;
  update public.profiles set full_name=left(trim(p_full_name),80) where id=auth.uid();
  return jsonb_build_object('success',true);
end $$;

create or replace function public.admin_generate_case_codes(p_count integer)
returns table(case_code text) language plpgsql security definer set search_path=public as $$
declare v_code text; i integer; tries integer;
begin
  if not public.has_perm('serials') then raise exception 'غير مصرح'; end if;
  if p_count < 1 or p_count > 100 then raise exception 'العدد يجب أن يكون بين 1 و100'; end if;
  for i in 1..p_count loop
    tries:=0;
    loop
      v_code:=lpad((floor(random()*900000)+100000)::bigint::text,6,'0'); tries:=tries+1;
      exit when not exists(select 1 from public.serial_codes s where s.case_code=v_code);
      if tries>100 then raise exception 'تعذر إنشاء كود فريد؛ أعد المحاولة'; end if;
    end loop;
    insert into public.serial_codes(serial_display,case_code,status) values(v_code,v_code,'active');
    case_code:=v_code; return next;
  end loop;
end $$;

create or replace function public.has_claimed_serial() returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null
   and coalesce((select not suspended from public.profiles where id=auth.uid()),true)
   and (public.has_perm('audio') or public.has_perm('serials_read')
        or exists(select 1 from public.serial_codes s where s.case_user_id=auth.uid()))
$$;

create table if not exists public.products(
 id uuid primary key default gen_random_uuid(), name text not null, description text,
 price numeric(12,2) not null default 0 check(price>=0), currency text not null default 'USD',
 active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_requests(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 customer_name text not null, items jsonb not null default '[]', total numeric(12,2) not null default 0,
 currency text not null default 'USD', status text not null default 'new'
 check(status in ('new','processing','completed','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.chat_messages(
 id uuid primary key default gen_random_uuid(), room text not null check(room in ('support','investigators')),
 sender_id uuid not null references auth.users(id) on delete cascade,
 sender_name text not null, body text not null check(length(body) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists order_requests_user_created on public.order_requests(user_id,created_at desc);
create index if not exists chat_messages_room_created on public.chat_messages(room,created_at);

alter table public.products enable row level security;
alter table public.order_requests enable row level security;
alter table public.chat_messages enable row level security;
alter table public.case_code_attempts enable row level security;

drop policy if exists tls_products_read on public.products;
create policy tls_products_read on public.products for select to authenticated
 using ((active and public.has_claimed_serial()) or public.has_perm('sales'));
drop policy if exists tls_products_admin on public.products;
create policy tls_products_admin on public.products for all to authenticated
 using (public.has_perm('sales')) with check(public.has_perm('sales'));

drop policy if exists tls_orders_read on public.order_requests;
create policy tls_orders_read on public.order_requests for select to authenticated
 using (user_id=auth.uid() or public.has_perm('sales'));
drop policy if exists tls_orders_insert on public.order_requests;
create policy tls_orders_insert on public.order_requests for insert to authenticated
 with check(user_id=auth.uid() and public.has_claimed_serial());
drop policy if exists tls_orders_admin_update on public.order_requests;
create policy tls_orders_admin_update on public.order_requests for update to authenticated
 using(public.has_perm('sales')) with check(public.has_perm('sales'));

drop policy if exists tls_chat_read on public.chat_messages;
create policy tls_chat_read on public.chat_messages for select to authenticated
 using(public.has_claimed_serial() or public.has_perm('sales'));
drop policy if exists tls_chat_insert on public.chat_messages;
create policy tls_chat_insert on public.chat_messages for insert to authenticated
 with check(sender_id=auth.uid() and (public.has_claimed_serial() or public.has_perm('sales')));
drop policy if exists tls_attempts_own on public.case_code_attempts;
create policy tls_attempts_own on public.case_code_attempts for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on function public.claim_case_code(text,text) from public;
grant execute on function public.claim_case_code(text,text) to authenticated;
revoke all on function public.admin_generate_case_codes(integer) from public;
grant execute on function public.admin_generate_case_codes(integer) to authenticated;


-- إنشاء ملف محقق تلقائياً عند التسجيل بالبريد وكلمة المرور.
create or replace function public.tls_profile_from_auth()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,role,full_name)
  values(new.id,'investigator',left(coalesce(new.raw_user_meta_data->>'full_name','المحقق'),80))
  on conflict(id) do update set full_name=coalesce(public.profiles.full_name,excluded.full_name);
  return new;
end $$;
drop trigger if exists tls_auth_profile_insert on auth.users;
create trigger tls_auth_profile_insert after insert on auth.users
for each row execute function public.tls_profile_from_auth();


commit;
