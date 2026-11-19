import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openArchive, sealArchive } from "./lib/migration-archive.mjs";
import { assertMigrationCandidate } from "./lib/migration-project-status.mjs";

const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
let phase = "validate-input";
async function main() {
  const sourceRef = arg("source-ref"),
    targetRef = arg("target-ref");
  assertMigrationCandidate(targetRef);
  if (
    !/^[a-z]{20}$/.test(sourceRef ?? "") ||
    !/^[a-z]{20}$/.test(targetRef ?? "") ||
    sourceRef === targetRef
  )
    throw new Error("Distinct projects required.");
  const output = path.resolve(arg("output"));
  if (!output.startsWith(path.resolve("backup") + path.sep) || !output.endsWith(".json"))
    throw new Error("Ignored evidence path required.");
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const archive = openArchive(await readFile(arg("source-config")), passphrase, sourceRef);
  const source = JSON.parse(archive.plaintext);
  archive.plaintext.fill(0);
  const staged = JSON.parse(await readFile(arg("stage-evidence")));
  const privileges = JSON.parse(await readFile(arg("privileges-evidence")));
  if (
    source.projectRef !== sourceRef ||
    staged.targetRef !== targetRef ||
    staged.sourceRef !== sourceRef ||
    staged.status !== "staged-and-verified-before-commit" ||
    privileges.targetRef !== targetRef ||
    !privileges.publicPrivilegesMatched
  )
    throw new Error("Verified staging required.");
  const auth = source.auth;
  if (
    !auth.external_google_enabled ||
    !auth.external_google_client_id ||
    !auth.external_google_secret ||
    Object.entries(auth).some(([k, v]) => k.startsWith("hook_") && k.endsWith("_enabled") && v)
  )
    throw new Error("Source Auth requires separate review.");
  const keys = [
    "external_google_enabled",
    "external_google_client_id",
    "external_google_secret",
    "external_google_additional_client_ids",
    "external_google_email_optional",
    "external_google_skip_nonce_check",
    "external_email_enabled",
    "external_email_magic_link_disabled",
    "external_anonymous_users_enabled",
    "password_min_length",
    "password_required_characters",
    "password_hibp_enabled",
    "jwt_exp",
    "mailer_allow_unverified_email_sign_ins",
    "mailer_autoconfirm",
    "mailer_secure_email_change_enabled",
    "mailer_otp_exp",
    "mailer_otp_length",
    "refresh_token_rotation_enabled",
    "security_refresh_token_reuse_interval",
    "security_manual_linking_enabled",
    "security_update_password_require_current_password",
    "security_update_password_require_reauthentication",
    "sessions_inactivity_timeout",
    "sessions_timebox",
    "sessions_single_per_user",
    "mfa_max_enrolled_factors",
    "mfa_totp_enroll_enabled",
    "mfa_totp_verify_enabled",
    "rate_limit_anonymous_users",
    "rate_limit_email_sent",
    "rate_limit_sms_sent",
    "rate_limit_token_refresh",
    "rate_limit_verify",
    "rate_limit_otp",
    "rate_limit_web3",
    "security_captcha_enabled",
    "security_captcha_provider",
  ];
  const changes = Object.fromEntries(keys.map((k) => [k, auth[k]]));
  const passwordOnly = process.argv.includes("--password-only");
  const googleSecret = process.env.MIGRATION_GOOGLE_CLIENT_SECRET?.trim();
  // The Management API export is not a recoverable provider secret. Require
  // the actual credential separately; never copy its redacted representation.
  if (
    !passwordOnly &&
    (!googleSecret ||
      googleSecret.length < 16 ||
      /^[a-f0-9]{64}$/i.test(googleSecret) ||
      googleSecret === auth.external_google_secret)
  )
    throw new Error("The real Google OAuth client secret is required.");
  changes.external_google_enabled = !passwordOnly;
  if (passwordOnly) delete changes.external_google_secret;
  else changes.external_google_secret = googleSecret;
  changes.site_url = "http://localhost:5189";
  changes.uri_allow_list =
    "http://localhost:5189/auth/callback,http://localhost:5189/reset-password";
  changes.disable_signup = true; // Only imported accounts may use this isolated candidate.
  for (const k of Object.keys(auth).filter(
    (k) => k.startsWith("mailer_notifications_") && k.endsWith("_enabled"),
  ))
    changes[k] = false;
  if (!process.argv.includes("--configure-local-target")) {
    console.log(
      JSON.stringify({
        targetRef,
        changedKeys: Object.keys(changes),
        localOnly: true,
        applied: false,
      }),
    );
    return;
  }
  const request = async (method, body) => {
    const result = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/config/auth`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MIGRATION_TARGET_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!result.ok) throw new Error("Auth management request failed.");
    return result.json();
  };
  phase = "preserve-destination-config";
  const before = await request("GET");
  await writeFile(
    output + ".before.enc",
    sealArchive(Buffer.from(JSON.stringify(before)), passphrase, targetRef),
    { flag: "wx", mode: 0o600 },
  );
  phase = "configure-local-candidate";
  await request("PATCH", changes);
  phase = "verify-config";
  const after = await request("GET");
  if (
    Object.entries(changes).some(
      ([k, v]) => k !== "external_google_secret" && JSON.stringify(after[k]) !== JSON.stringify(v),
    )
  )
    throw new Error("Auth configuration differs.");
  const evidence = {
    sourceRef,
    targetRef,
    completedAt: new Date().toISOString(),
    googleEnabled: !passwordOnly,
    googleSecretWriteAcknowledged: !passwordOnly,
    googleSecretRequiresLoginValidation: !passwordOnly,
    existingAccountsOnly: true,
    callback: "https://" + targetRef + ".supabase.co/auth/v1/callback",
    siteUrl: after.site_url,
    configVerified: true,
    smtpRestored: false,
    loginTested: false,
    productionCutoverAuthorized: false,
  };
  await writeFile(output, JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(evidence));
}
main().catch(() => {
  console.error(
    JSON.stringify({
      error: "Candidate Auth preparation failed; source and production unchanged.",
      phase,
    }),
  );
  process.exitCode = 1;
});
