import { describe, expect, it } from "vitest";
import { decideIngestion } from "@/sources/ingest-decision";

describe("decideIngestion", () => {
  it("skips unchanged sources and ingests changed or forced ones", () => {
    expect(decideIngestion({ force: false, notModified: true, storedHash: "a", newHash: null }).action).toBe("skip");
    expect(decideIngestion({ force: false, notModified: false, storedHash: "a", newHash: "a" }).action).toBe("skip");
    expect(decideIngestion({ force: false, notModified: false, storedHash: "a", newHash: "b" }).action).toBe("ingest");
    expect(decideIngestion({ force: false, notModified: false, storedHash: null, newHash: "b" })).toEqual({ action: "ingest", reason: "first ingestion" });
    expect(decideIngestion({ force: true, notModified: true, storedHash: "a", newHash: "a" }).action).toBe("ingest");
    expect(
      decideIngestion({ force: false, notModified: false, storedHash: "a", newHash: "b", storedVersion: "1", newVersion: "2" }).reason,
    ).toMatch(/new version 2/);
  });
});
