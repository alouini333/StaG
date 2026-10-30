import { describe, expect, it } from "vitest";
import { allowlistFromToolOutputs, sanitizeCitations } from "@/chat/citations";

const outputs = [
  { official: [{ citationId: "S1", url: "https://www.gesetze-im-internet.de/stag/__10.html" }], community: [] },
  { found: true, citationId: "L-StAG-10-3", url: "https://www.gesetze-im-internet.de/stag/__10.html" },
];

describe("citation sanitisation", () => {
  const allow = allowlistFromToolOutputs(outputs);

  it("collects ids and urls from nested tool outputs", () => {
    expect([...allow.validIds]).toEqual(["S1", "L-StAG-10-3"]);
    expect(allow.validUrls.has("https://www.gesetze-im-internet.de/stag/__10.html")).toBe(true);
  });

  it("keeps valid markers and strips unknown ones", () => {
    const r = sanitizeCitations("Fünf Jahre [S1] gelten [S9]. Siehe [L-StAG-10-3] und [L-StAG-99].", allow);
    expect(r.text).toBe("Fünf Jahre [S1] gelten. Siehe [L-StAG-10-3] und.");
    expect(r.removedIds).toEqual(["S9", "L-StAG-99"]);
  });

  it("keeps retrieved urls and replaces invented ones", () => {
    const r = sanitizeCitations("Quelle: https://www.gesetze-im-internet.de/stag/__10.html und https://example.com/fake.", allow);
    expect(r.text).toContain("https://www.gesetze-im-internet.de/stag/__10.html");
    expect(r.text).toContain("[Link entfernt / link removed]");
    expect(r.removedUrls).toEqual(["https://example.com/fake."]);
  });

  it("leaves plain text untouched", () => {
    expect(sanitizeCitations("Kein Zitat hier.", allow).text).toBe("Kein Zitat hier.");
  });
});
