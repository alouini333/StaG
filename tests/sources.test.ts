import { describe, expect, it } from "vitest";
import { collectSources } from "@/chat/sources";

describe("collectSources", () => {
  it("builds the sources list from tool parts and the citation allowlist", () => {
    const message = {
      parts: [
        { type: "text", text: "Antwort [S1] [L-StAG-10]" },
        { type: "tool-searchCitizenshipSources", state: "output-available", output: { official: [{ citationId: "S1", tier: 1, tierLabel: "Gesetz", title: "StAG", sectionRef: "§ 10 StAG", url: "https://www.gesetze-im-internet.de/stag/__10.html" }], community: [], communityIncluded: true, communityReason: "experience question" } },
        { type: "tool-lookupStatute", state: "output-available", output: { found: true, citationId: "L-StAG-10", sectionRef: "§ 10 StAG", title: null, url: "https://www.gesetze-im-internet.de/stag/__10.html", stand: "Stand X" } },
        { type: "tool-lookupStatute", state: "input-available", output: undefined },
      ],
    };
    const sources = collectSources(message as never);
    expect(sources.official.map((s) => s.citationId)).toEqual(["S1", "L-StAG-10"]);
    expect(sources.communityIncluded).toBe(true);
    expect(sources.communityReason).toBe("experience question");
    expect([...sources.allow.validIds]).toEqual(["S1", "L-StAG-10"]);
  });
});
