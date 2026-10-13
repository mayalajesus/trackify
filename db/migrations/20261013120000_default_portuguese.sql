-- New profiles created by auth triggers must use the same default as the app.
-- Existing language preferences remain unchanged.
alter table public.user_preferences alter column language set default 'pt-BR';
