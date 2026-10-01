import { describe, expect, it } from "vitest";
import { describeConnection, needsSsl, poolConfigFor } from "@/db/pool-config";

const supabase = "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

describe("poolConfigFor", () => {
  it("keeps the runtime pool small with a short idle timeout", () => {
    const config = poolConfigFor("runtime", supabase);
    expect(config.max).toBeLessThanOrEqual(5);
    expect(config.idleTimeoutMillis).toBeLessThanOrEqual(10_000);
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("gives the session pool a longer idle timeout", () => {
    const config = poolConfigFor("session", supabase.replace("6543", "5432"));
    expect(config.idleTimeoutMillis).toBeGreaterThan(poolConfigFor("runtime", supabase).idleTimeoutMillis!);
  });
});

describe("needsSsl", () => {
  it("disables TLS for localhost and sslmode=disable only", () => {
    expect(needsSsl(supabase)).toBe(true);
    expect(needsSsl("postgresql://u:p@localhost:5432/db")).toBe(false);
    expect(needsSsl("postgresql://u:p@db.example.com:5432/db?sslmode=disable")).toBe(false);
  });
});

describe("describeConnection", () => {
  it("never includes credentials", () => {
    const text = describeConnection(supabase);
    expect(text).toBe("aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
    expect(text).not.toContain("pw");
  });
});
