import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { extractAuthIdentity } from "./auth-profile.mjs";
import { DataApiError } from "./data-api-error.mjs";

const jwksByAuthUrl = new Map();

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
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.supabasePublishableKey, authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new DataApiError(401, "The authentication token is invalid or expired.");
    }
    const user = await response.json();
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
