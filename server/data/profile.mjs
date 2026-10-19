import { DataApiError } from "../data-api-error.mjs";
import { hasColumn } from "./access.mjs";
import { defaultAvatarUrls } from "./validation.mjs";

export async function ensureProfile(client, user, config) {
  const existingProfile = await client.query(
    `select p.name, p.email, p.initials, p.auth_issuer,
            prefs.user_id as preferences_user_id,
            case when $2::text is null then false else
              (coalesce(to_jsonb(prefs)->>'avatar_data_url', '') = ''
               or to_jsonb(prefs)->>'avatar_data_url' = any($3::text[]))
              and (to_jsonb(prefs)->>'avatar_data_url') is distinct from $2
            end as needs_auth_avatar
       from public.profiles p
       left join public.user_preferences prefs on prefs.user_id = p.id
      where p.id = $1 limit 1`,
    [user.id, user.avatarUrl || null, defaultAvatarUrls],
  );
  const storedProfile = existingProfile.rows[0];
  const authenticatedName = String(user.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const authenticatedEmail = String(user.email ?? "")
    .trim()
    .toLowerCase();
  const name =
    authenticatedName ||
    String(storedProfile?.name ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authenticatedEmail)
    ? authenticatedEmail
    : String(storedProfile?.email ?? "")
        .trim()
        .toLowerCase();
  if (!name) {
    throw new DataApiError(400, "A profile name is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DataApiError(400, "A valid email is required.");
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    (user.email[0]?.toUpperCase() ?? "?");
  // Return only a boolean above: a custom inline image must not be downloaded
  // again by every timer poll or unrelated authenticated operation.
  const needsAuthAvatar = Boolean(
    user.avatarUrl && (!storedProfile || storedProfile.needs_auth_avatar),
  );
  // The common read/poll path needs no writes or row locks. New profiles and
  // changed auth details still go through the idempotent initialization below.
  if (
    storedProfile?.auth_issuer === config.databaseProvider &&
    storedProfile.email === email &&
    storedProfile.name &&
    storedProfile.initials &&
    storedProfile.preferences_user_id &&
    !needsAuthAvatar
  )
    return;
  await client.query(
    `insert into public.profiles (id, auth_issuer, name, email, initials)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       auth_issuer = excluded.auth_issuer,
       email = case when excluded.email <> '' then excluded.email else profiles.email end,
       name = case when profiles.name = '' and excluded.name <> '' then excluded.name else profiles.name end,
       initials = case when profiles.initials = '' and excluded.initials <> '' then excluded.initials else profiles.initials end,
       updated_at = now()
     where profiles.auth_issuer is distinct from excluded.auth_issuer
        or profiles.email is distinct from excluded.email
        or profiles.name = '' or profiles.initials = ''`,
    [user.id, config.databaseProvider, name, email, initials],
  );
  await client.query(
    `insert into public.user_preferences (user_id, language) values ($1, $2)
     on conflict (user_id) do nothing`,
    [user.id, config.initialLanguage === "en-US" ? "en-US" : "pt-BR"],
  );
  if (needsAuthAvatar && (await hasColumn(client, "user_preferences", "avatar_data_url"))) {
    await client.query(
      `update public.user_preferences
          set avatar_data_url = $2, updated_at = now()
        where user_id = $1
          and avatar_data_url is distinct from $2
          and (
            avatar_data_url is null
            or avatar_data_url = ''
            or avatar_data_url = any($3::text[])
          )`,
      [user.id, user.avatarUrl, defaultAvatarUrls],
    );
  }
}
