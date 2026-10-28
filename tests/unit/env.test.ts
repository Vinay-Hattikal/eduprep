import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

const valid = {
  APP_ENV: "local",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5444/eduprep",
  AUTH_SECRET: "x".repeat(32),
  AUTH_MODE: "dev",
};

describe("parseEnv", () => {
  it("accepts a valid local environment", () => {
    expect(parseEnv(valid)).toMatchObject({ APP_ENV: "local", AUTH_MODE: "dev" });
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("never allows dev login in production (D-020)", () => {
    expect(() => parseEnv({ ...valid, APP_ENV: "production" })).toThrow(
      /AUTH_MODE=dev is not allowed/,
    );
  });
});
