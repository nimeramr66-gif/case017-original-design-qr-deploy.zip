-- THE LAST SHADOW — ترقية الإدارة (آمنة: لا تحذف أي بيانات)
-- نفّذه كاملاً في Supabase → SQL Editor.  قبل التنفيذ خذ نسخة احتياطية.
-- افتراضات: serial_codes فيه عمود id وstatus وserial_display وcreated_at؛ profiles فيه id وrole.

-- 1) أعمدة إضافية (لا تمس الموجود)
alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.serial_codes add column if not exists customer_name text;
alter table public.serial_codes add column if not exists customer_email text;
alter table public.serial_codes add column if not exists country text;
alter table public.serial_codes add column if not exists city text;
alter table public.serial_codes add column if not exists purchase_ref text;
alter table public.serial_codes add column if not exists admin_notes text;
alter table public.serial_codes add column if not exists revoked_at timestamptz;
do $$ begin
  create unique index if not exists serial_codes_serial_display_uq on public.serial_codes(serial_display);
exception when others then raise notice 'تعذّر إنشاء فهرس منع التكرار (يوجد تكرار حالي؟): %', sqlerrm; end $$;

-- 2) جداول جديدة
create table if not exists public.activity_logs(
  id bigint generated always as identity primary key, created_at timestamptz not null default now(),
  event_type text not null, user_id uuid, serial text, session_id text, result text default 'ok', details jsonb default '{}');
create index if not exists activity_logs_created on public.activity_logs(created_at desc);
create table if not exists public.sales(
  id uuid primary key default gen_random_uuid(), serial text, customer_name text, customer_email text,
  amount numeric(12,2) not null default 0, currency text not null default 'USD', method text,
  purchased_at timestamptz not null default now(), notes text, created_by uuid default auth.uid(), created_at timestamptz default now());
create table if not exists public.audio_tracks(
  id uuid primary key default gen_random_uuid(), title text not null, description text, section text default 'recordings',
  path text not null, version int not null default 1, history jsonb not null default '[]', published boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.site_content(
  id uuid primary key default gen_random_uuid(), kind text not null, title text not null, body text, image_url text,
  sort int not null default 0, published boolean not null default false, created_by uuid default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.print_jobs(
  id uuid primary key default gen_random_uuid(), serial text not null unique, case_label text, status text not null default 'generated',
  generated_by uuid default auth.uid(), generated_at timestamptz default now(), customer_name text);
create table if not exists public.backups_log(
  id uuid primary key default gen_random_uuid(), kind text, rows_count int, created_by uuid default auth.uid(), created_at timestamptz default now());

-- 3) دوال الصلاحيات (تُفرض في الخادم)
create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select case
    when role in ('admin','super_admin') then true
    when role='content_admin' then p in ('content','audio')
    when role='support_admin' then p in ('serials_read','users_read','logs')
    else false end from public.profiles where id=auth.uid()),false) $$;

create or replace function public.has_claimed_serial() returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null
   and coalesce((select not suspended from public.profiles where id=auth.uid()),true)
   and (public.has_perm('audio') or public.has_perm('serials_read')
        or exists(select 1 from public.serial_codes s where auth.uid()::text in
             (to_jsonb(s)->>'used_by',to_jsonb(s)->>'claimed_by',to_jsonb(s)->>'investigator_id',to_jsonb(s)->>'user_id'))) $$;

-- منع تغيير الدور/الإيقاف إلا من Super Admin
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.has_perm('admins') then
    if tg_op='INSERT' then
      if new.role in ('admin','super_admin','content_admin','support_admin') then new.role:='investigator'; end if;
      new.suspended:=false;
    else new.role:=old.role; new.suspended:=old.suspended; end if;
  end if; return new; end $$;
drop trigger if exists profiles_guard_t on public.profiles;
create trigger profiles_guard_t before insert or update on public.profiles for each row execute function public.profiles_guard();

-- 4) السجلات
create or replace function public._log(p_type text,p_serial text,p_result text,p_details jsonb) returns void
language sql security definer set search_path=public as $$
  insert into public.activity_logs(event_type,user_id,serial,result,details) values(p_type,auth.uid(),p_serial,p_result,coalesce(p_details,'{}')) $$;
revoke execute on function public._log(text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.log_event(p_type text,p_serial text default null,p_result text default 'ok',p_details jsonb default '{}',p_session text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  if p_type not in ('serial_activation','login_success','login_failed','logout','case_access','audio_play','document_access') then
    if not (p_type in ('content_update','audio_upload','audio_update','audio_delete','pdf_generation','sale_create','backup_export','backup_restore','admin_login')
            and (public.has_perm('content') or public.has_perm('audio') or public.has_perm('serials_read'))) then
      raise exception 'نوع حدث غير مسموح'; end if;
  end if;
  if (select count(*) from public.activity_logs where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then
    raise exception 'تجاوزت الحد المسموح من الأحداث'; end if;
  insert into public.activity_logs(event_type,user_id,serial,session_id,result,details)
  values(p_type,auth.uid(),left(p_serial,40),left(p_session,64),left(coalesce(p_result,'ok'),20),coalesce(p_details,'{}')); end $$;

-- 5) عمليات المشرف (تحقق خادمي)
create or replace function public.admin_update_serial(p_id text,p jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_perm('serials') then raise exception 'غير مصرح'; end if;
  update public.serial_codes set
    customer_name = case when p ? 'customer_name' then left(p->>'customer_name',120) else customer_name end,
    customer_email= case when p ? 'customer_email' then left(p->>'customer_email',160) else customer_email end,
    country       = case when p ? 'country' then left(p->>'country',80) else country end,
    city          = case when p ? 'city' then left(p->>'city',80) else city end,
    purchase_ref  = case when p ? 'purchase_ref' then left(p->>'purchase_ref',80) else purchase_ref end,
    admin_notes   = case when p ? 'admin_notes' then left(p->>'admin_notes',2000) else admin_notes end
  where id::text=p_id;
  perform public._log('serial_update',p_id,'ok',p); end $$;

create or replace function public.admin_set_serial_status(p_id text,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_perm('serials') then raise exception 'غير مصرح'; end if;
  if p_status not in ('active','used','revoked','expired') then raise exception 'حالة غير صالحة'; end if;
  update public.serial_codes set status=p_status, revoked_at=case when p_status='revoked' then now() else null end where id::text=p_id;
  perform public._log(case when p_status='revoked' then 'serial_revoke' else 'serial_status' end,p_id,'ok',jsonb_build_object('status',p_status)); end $$;

create or replace function public.admin_set_role(p_email text,p_role text) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
  if not public.has_perm('admins') then raise exception 'غير مصرح'; end if;
  if p_role not in ('investigator','admin','super_admin','content_admin','support_admin') then raise exception 'دور غير صالح'; end if;
  select id into uid from auth.users where lower(email)=lower(p_email);
  if uid is null then raise exception 'لا يوجد حساب بهذا البريد'; end if;
  if uid=auth.uid() and p_role not in ('admin','super_admin') then raise exception 'لا يمكنك خفض صلاحياتك بنفسك'; end if;
  insert into public.profiles(id,role) values(uid,p_role) on conflict (id) do update set role=excluded.role;
  perform public._log('admin_role_change',null,'ok',jsonb_build_object('email',p_email,'role',p_role)); end $$;

create or replace function public.admin_set_suspended(p_id uuid,p_value boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_perm('admins') then raise exception 'غير مصرح'; end if;
  update public.profiles set suspended=p_value where id=p_id;
  perform public._log(case when p_value then 'user_suspend' else 'user_restore' end,null,'ok',jsonb_build_object('user',p_id)); end $$;

create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_perm('serials_read') then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
   'serials',(select jsonb_build_object('total',count(*),'active',count(*) filter(where status='active'),'used',count(*) filter(where status='used'),
              'revoked',count(*) filter(where status='revoked'),'expired',count(*) filter(where status='expired')) from public.serial_codes),
   'users',(select count(*) from public.profiles where coalesce(role,'') not in ('admin','super_admin','content_admin','support_admin')),
   'sales',(select jsonb_build_object('total',count(*),'today',count(*) filter(where purchased_at::date=current_date),'revenue',coalesce(sum(amount),0)) from public.sales),
   'daily_sales',(select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') from (select purchased_at::date d,count(*) n from public.sales where purchased_at>now()-interval '30 days' group by 1) x),
   'daily_events',(select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') from (select created_at::date d,count(*) n from public.activity_logs where created_at>now()-interval '30 days' group by 1) x),
   'daily_regs',(select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') from (select created_at::date d,count(*) n from public.profiles where created_at>now()-interval '30 days' group by 1) x)); end $$;

-- 6) RLS
alter table public.profiles enable row level security;
alter table public.serial_codes enable row level security;
alter table public.activity_logs enable row level security;
alter table public.sales enable row level security;
alter table public.audio_tracks enable row level security;
alter table public.site_content enable row level security;
alter table public.print_jobs enable row level security;
alter table public.backups_log enable row level security;

drop policy if exists tls_profiles_select on public.profiles;
create policy tls_profiles_select on public.profiles for select to authenticated using (id=auth.uid() or public.has_perm('users_read'));
drop policy if exists tls_profiles_upd_self on public.profiles;
create policy tls_profiles_upd_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists tls_serial_select on public.serial_codes;
create policy tls_serial_select on public.serial_codes for select to authenticated using (public.has_perm('serials_read'));
drop policy if exists tls_logs_select on public.activity_logs;
create policy tls_logs_select on public.activity_logs for select to authenticated using (public.has_perm('logs'));
drop policy if exists tls_sales_all on public.sales;
create policy tls_sales_all on public.sales for all to authenticated using (public.has_perm('sales')) with check (public.has_perm('sales'));
drop policy if exists tls_audio_all on public.audio_tracks;
create policy tls_audio_all on public.audio_tracks for all to authenticated using (public.has_perm('audio')) with check (public.has_perm('audio'));
drop policy if exists tls_audio_read on public.audio_tracks;
create policy tls_audio_read on public.audio_tracks for select to authenticated using (published and public.has_claimed_serial());
drop policy if exists tls_content_all on public.site_content;
create policy tls_content_all on public.site_content for all to authenticated using (public.has_perm('content')) with check (public.has_perm('content'));
drop policy if exists tls_content_read on public.site_content;
create policy tls_content_read on public.site_content for select to authenticated using (published and public.has_claimed_serial());
drop policy if exists tls_print_all on public.print_jobs;
create policy tls_print_all on public.print_jobs for all to authenticated using (public.has_perm('pdf')) with check (public.has_perm('pdf'));
drop policy if exists tls_backup_all on public.backups_log;
create policy tls_backup_all on public.backups_log for all to authenticated using (public.has_perm('backup')) with check (public.has_perm('backup'));

-- 7) تخزين الصوت (خاص + روابط موقّعة)
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('case-audio','case-audio',false,52428800,array['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg','audio/webm','audio/aac'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists tls_audio_obj_read on storage.objects;
create policy tls_audio_obj_read on storage.objects for select to authenticated using (bucket_id='case-audio' and
  (public.has_perm('audio') or (public.has_claimed_serial() and exists(select 1 from public.audio_tracks t where t.path=name and t.published))));
drop policy if exists tls_audio_obj_ins on storage.objects;
create policy tls_audio_obj_ins on storage.objects for insert to authenticated with check (bucket_id='case-audio' and public.has_perm('audio'));
drop policy if exists tls_audio_obj_upd on storage.objects;
create policy tls_audio_obj_upd on storage.objects for update to authenticated using (bucket_id='case-audio' and public.has_perm('audio'));
drop policy if exists tls_audio_obj_del on storage.objects;
create policy tls_audio_obj_del on storage.objects for delete to authenticated using (bucket_id='case-audio' and public.has_perm('audio'));

-- 8) مراجعة السياسات القديمة (قد تكون متساهلة):
-- select tablename,policyname,cmd,roles,qual from pg_policies where schemaname='public' order by 1,2;
