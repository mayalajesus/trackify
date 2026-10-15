-- Existing clients receive a neutral color; project colors are not reassigned arbitrarily.
alter table public.clients
  add column color text not null default '#000000'
  constraint clients_color_hex check (color ~ '^#[0-9a-fA-F]{6}$');
