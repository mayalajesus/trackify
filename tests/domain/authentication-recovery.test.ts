import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  decodeJwt: vi.fn(),
  jwtVerify: mocks.verify,
}));
import { authenticateDataRequest } from "../../server/authentication.mjs";

const config = {
  databaseProvider: "neon",
  neonAuthUrl: "https://auth.example.test/api/auth",
  neonAuthIssuer: "https://auth.example.test",
};
const authenticate = () =>
  authenticateDataRequest({ headers: { authorization: "Bearer signed-token" } }, config, () => ({
    query: async () => ({ rows: [] }),
  }));
const timeout = () => Object.assign(new Error("key service timeout"), { code: "ERR_JWKS_TIMEOUT" });

describe("verification key service recovery", () => {
  it("retries one failed key fetch and still verifies issuer and audience", async () => {
    mocks.verify
      .mockReset()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({
        payload: { sub: "qa-user", name: "QA Person", email: "qa@example.test" },
      });
    await expect(authenticate()).resolves.toMatchObject({ id: "qa-user" });
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.verify).toHaveBeenLastCalledWith("signed-token", expect.anything(), {
      issuer: config.neonAuthIssuer,
      audience: config.neonAuthIssuer,
    });
  });
  it("reports repeated key service failure as temporary unavailability", async () => {
    mocks.verify.mockReset().mockRejectedValue(timeout());
    await expect(authenticate()).rejects.toMatchObject({
      status: 503,
      code: "auth_verification_unavailable",
    });
    expect(mocks.verify).toHaveBeenCalledTimes(2);
  });
  it.each([
    "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    "ERR_JWT_EXPIRED",
    "ERR_JWT_CLAIM_VALIDATION_FAILED",
  ])("rejects %s without retrying or trusting unverified claims", async (code) => {
    mocks.verify.mockReset().mockRejectedValue(Object.assign(new Error("invalid"), { code }));
    await expect(authenticate()).rejects.toMatchObject({ status: 401 });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  });
});
