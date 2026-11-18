import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { extractAuthIdentity } from "./auth-profile.mjs";
import { DataApiError } from "./data-api-error.mjs";

const jwksByAuthUrl = new Map();
const supabaseJwks = new Map();

function unavailable() {
  return new DataApiError(503, "Authentication is temporarily unavailable. Please try again.", {
    code: "auth_verification_unavailable",
    retryAfter: 15,
  });
}

async function verifySupabase(token, config, getPool) {
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new DataApiError(401, "The authentication token is invalid or expired.");
  }
  if (header.alg === "HS256") return null; // Legacy tokens retain Auth's verification path.
  if (!["ES256", "RS256"].includes(header.alg))
    throw new DataApiError(401, "The authentication token is invalid or expired.");
  const issuer = `${config.supabaseUrl}/auth/v1`;
  let keys = supabaseJwks.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    });
    supabaseJwks.set(issuer, keys);
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer,
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
      requiredClaims: ["exp", "iat", "sub", "session_id"],
    }));
  } catch (error) {
    if (isKeyServiceFailure(error)) throw unavailable();
    throw new DataApiError(401, "The authentication token is invalid or expired.");
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(payload.sub ?? "") ||
    !uuid.test(payload.session_id ?? "") ||
    payload.role !== "authenticated"
  )
    throw new DataApiError(401, "The authentication token is invalid or expired.");
  // Never cache authorization or trust stale user metadata from a JWT. This
  // small live read preserves sign-out, account bans and current profile data.
  const result = await getPool(config).query(
    `select u.id::text, u.email, u.email_confirmed_at, u.last_sign_in_at,
       (u.banned_until > now()) as banned,
       jsonb_build_object('full_name',u.raw_user_meta_data->'full_name',
         'name',u.raw_user_meta_data->'name','displayName',u.raw_user_meta_data->'displayName',
         'given_name',u.raw_user_meta_data->'given_name','family_name',u.raw_user_meta_data->'family_name',
         'first_name',u.raw_user_meta_data->'first_name','last_name',u.raw_user_meta_data->'last_name',
         'firstName',u.raw_user_meta_data->'firstName','lastName',u.raw_user_meta_data->'lastName',
         'avatar_url',u.raw_user_meta_data->'avatar_url','picture',u.raw_user_meta_data->'picture',
         'image',u.raw_user_meta_data->'image') as user_metadata
     from auth.users u join auth.sessions s on s.user_id=u.id
     where u.id=$1::uuid and s.id=$2::uuid and u.deleted_at is null
       and (s.not_after is null or s.not_after>now())`,
    [payload.sub, payload.session_id],
  );
  const user = result.rows[0];
  if (!user) throw new DataApiError(401, "The authentication token is invalid or expired.");
  if (user.banned) throw new DataApiError(403, "This account is unavailable.");
  return user;
}

function isKeyServiceFailure(error) {
  return (
    error?.code === "ERR_JWKS_TIMEOUT" ||
    (error instanceof TypeError && error.message === "fetch failed") ||
    (error?.code === "ERR_JOSE_GENERIC" &&
      error.message === "Expected 200 OK from the JSON Web Key Set HTTP response")
  );
}

function tokenIssuedAt(token) {
  try {
    const issuedAt = decodeJwt(token).iat;
    return typeof issuedAt === "number" ? issuedAt * 1_000 : 0;
  } catch {
    return 0;
  }
}

export async function authenticateDataRequest(request, config, getPool) {
  const authorization = request.headers?.authorization ?? request.headers?.Authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new DataApiError(401, "Authentication is required.");

  if (config.databaseProvider === "supabase") {
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new DataApiError(500, "Supabase authentication is not configured.");
    }
    let user = await verifySupabase(token, config, getPool);
    if (!user) {
      let response;
      try {
        response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
          headers: { apikey: config.supabasePublishableKey, authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw unavailable();
      }
      if (!response.ok) {
        if ([402, 408, 429].includes(response.status) || response.status >= 500)
          throw unavailable();
        throw new DataApiError(401, "The authentication token is invalid or expired.");
      }
      try {
        user = await response.json();
      } catch {
        throw unavailable();
      }
    }
    if (!user.email_confirmed_at) {
      throw new DataApiError(403, "Confirm your email before accessing your account.");
    }
    return {
      ...extractAuthIdentity({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.displayName ?? user.user_metadata?.name,
        metadata: user.user_metadata,
      }),
      authenticatedAt: Date.parse(user.last_sign_in_at ?? "") || tokenIssuedAt(token),
    };
  }

  if (config.databaseProvider !== "neon" || !config.neonAuthUrl || !config.neonAuthIssuer) {
    throw new DataApiError(500, "Neon authentication is not configured.");
  }
  const sessionResult = await getPool(config).query(
    `select u.id::text, u.email, u.name, u.image
       from neon_auth.session s
       join neon_auth."user" u on u.id = s."userId"
      where s.token = $1 and s."expiresAt" > now()
      limit 1`,
    [token],
  );
  if (sessionResult.rows[0]) {
    return {
      ...extractAuthIdentity({
        id: sessionResult.rows[0].id,
        email: sessionResult.rows[0].email,
        name: sessionResult.rows[0].name,
        metadata: { image: sessionResult.rows[0].image },
      }),
      authenticatedAt: tokenIssuedAt(token),
    };
  }

  let keySet = jwksByAuthUrl.get(config.neonAuthUrl);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${config.neonAuthUrl}/.well-known/jwks.json`));
    jwksByAuthUrl.set(config.neonAuthUrl, keySet);
  }
  let verified;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      verified = await jwtVerify(token, keySet, {
        issuer: config.neonAuthIssuer,
        audience: config.neonAuthIssuer,
      });
      break;
    } catch (error) {
      // Retry only fetching public verification keys, once and within jose's
      // existing deadline. Invalid signatures/claims never bypass verification.
      if (isKeyServiceFailure(error)) {
        if (attempt === 0) continue;
        throw new DataApiError(
          503,
          "Authentication is temporarily unavailable. Please try again.",
          {
            code: "auth_verification_unavailable",
          },
        );
      }
      throw new DataApiError(401, "The authentication token is invalid or expired.");
    }
  }
  if (!verified.payload.sub) {
    throw new DataApiError(401, "The authentication token has no user subject.");
  }
  return {
    ...extractAuthIdentity({
      id: verified.payload.sub,
      email: verified.payload.email,
      name: verified.payload.name,
      metadata: verified.payload,
    }),
    authenticatedAt: typeof verified.payload.iat === "number" ? verified.payload.iat * 1_000 : 0,
  };
}
