import { createHash, randomBytes } from "node:crypto";
import { DataApiError } from "./data-api-error.mjs";
import { isAllowedExtensionOrigin } from "./extension-origin.mjs";
export const ACCESS_TTL = 15 * 60_000;
export const REFRESH_TTL = 90 * 24 * 60 * 60_000;
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const secret = (prefix) => prefix + randomBytes(32).toString("hex");
const scope = [
  "getExtensionSession",
  "getExtensionContext",
  "extensionTimerAction",
  "refreshExtensionSession",
  "revokeExtensionSession",
];
export async function authenticateExtension(request, config, pool, operation) {
  const token = String(request.headers?.authorization ?? "").replace(/^Bearer /, "");
  if (!/^tx[ar]_/.test(token)) return null;
  const origin = String(request.headers?.origin ?? "");
  if (!isAllowedExtensionOrigin(origin, config.extensionIds) || !scope.includes(operation))
    throw new DataApiError(403, "Operação não permitida para a extensão.");
  const refresh = token.startsWith("txr_");
  if (!refresh && operation === "refreshExtensionSession")
    throw new DataApiError(403, "Refresh credential required.");
  if (
    !/^tx[ar]_[a-f0-9]{64}$/.test(token) ||
    (refresh && !["refreshExtensionSession", "revokeExtensionSession"].includes(operation))
  )
    throw new DataApiError(401, "Conecte novamente a extensão.");
  const result = await pool.query(
    `select s.id as session_id,p.id,p.name,p.email,p.auth_issuer from public.extension_sessions s join public.profiles p on p.id=s.user_id
    where s.${refresh ? "refresh_hash" : "access_hash"}=$1 and s.extension_id=$2 and s.revoked_at is null and s.expires_at>now()
    ${refresh ? "" : "and s.access_expires_at>now()"}`,
    [hashToken(token), origin.slice("chrome-extension://".length)],
  );
  const row = result.rows[0];
  if (!row) throw new DataApiError(401, "Conecte novamente a extensão.");
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    issuer: row.auth_issuer,
    extensionSessionId: row.session_id,
  };
}
export async function createExtensionSession(client, user, origin, allowedIds) {
  if (user.extensionSessionId || !isAllowedExtensionOrigin(origin, allowedIds))
    throw new DataApiError(403, "Conexão não permitida.");
  const token = secret("txa_"),
    refreshToken = secret("txr_"),
    expiresAt = Date.now() + ACCESS_TTL;
  await client.query(
    `insert into public.extension_sessions(user_id,extension_id,access_hash,refresh_hash,access_expires_at,expires_at) values($1,$2,$3,$4,$5,$6)`,
    [
      user.id,
      origin.slice("chrome-extension://".length),
      hashToken(token),
      hashToken(refreshToken),
      new Date(expiresAt),
      new Date(Date.now() + REFRESH_TTL),
    ],
  );
  return {
    version: 2,
    token,
    refreshToken,
    expiresAt,
    user: { id: user.id, email: user.email, name: user.name ?? "" },
  };
}
export async function refreshExtensionSession(client, user) {
  if (!user.extensionSessionId) throw new DataApiError(403, "Sessão da extensão necessária.");
  const token = secret("txa_"),
    expiresAt = Date.now() + ACCESS_TTL;
  const result = await client.query(
    `update public.extension_sessions set access_hash=$1,access_expires_at=$2,expires_at=$3 where id=$4 and revoked_at is null and expires_at>now() returning id`,
    [
      hashToken(token),
      new Date(expiresAt),
      new Date(Date.now() + REFRESH_TTL),
      user.extensionSessionId,
    ],
  );
  if (!result.rows.length) throw new DataApiError(401, "Conecte novamente a extensão.");
  return { token, expiresAt };
}
export async function revokeExtensionSession(client, user) {
  if (!user.extensionSessionId) throw new DataApiError(403, "Sessão da extensão necessária.");
  await client.query("update public.extension_sessions set revoked_at=now() where id=$1", [
    user.extensionSessionId,
  ]);
  return { revoked: true };
}
