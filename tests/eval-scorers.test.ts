import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { citationValidity, clarification, detectLanguage, languageMatch, noRawUrls, offTopicDecline, outdatedLabelling, sectionRefs, tierUsage, type EvalRun } from "../evals/scorers/deterministic";

const outputs = [{ official: [{ citationId: "S1", tier: 1, sectionRef: "§ 10 StAG", url: "https://www.gesetze-im-internet.de/stag/__10.html" }, { citationId: "S2", tier: 2, title: "BMI FAQ", url: "https://www.bmi.bund.de/x" }], community: [] }];
const run = (text: string, toolNames = ["searchCitizenshipSources"]): EvalRun => ({ text, toolOutputs: outputs, toolNames });

describe("deterministic scorers", () => {
  it("detects the answer language", () => {
    expect(detectLanguage("Das Gesetz sagt, dass Sie fünf Jahre warten müssen.")).toBe("de");
    expect(detectLanguage("The law says that you have to wait for five years.")).toBe("en");
    expect(languageMatch(run("Sie müssen fünf Jahre warten und das ist nicht alles."), "en").score).toBe(0);
  });

  it("validates citations against tool outputs", () => {
    expect(citationValidity(run("Fünf Jahre [S1]."), { mustCiteTiers: [1] }).score).toBe(1);
    expect(citationValidity(run("Fünf Jahre [S9]."), { mustCiteTiers: [1] }).score).toBe(0);
    expect(citationValidity(run("Fünf Jahre."), { mustCiteAny: true }).score).toBe(0);
    expect(citationValidity(run("Ich kann nur zu Einbürgerung helfen.", []), { noCitations: true }).score).toBe(1);
  });

  it("checks tiers, sections, urls, outdated labels, clarification and declines", () => {
    expect(tierUsage(run("[S1] [S2]"), { mustCiteTiers: [1, 2] }).score).toBe(1);
    expect(tierUsage(run("[S2]"), { mustCiteTiers: [1] }).score).toBe(0);
    expect(sectionRefs(run("Siehe [S1]"), { expectedSectionRefs: ["§ 10", "§ 9"] }).score).toBe(0.5);
    expect(noRawUrls(run("Siehe https://example.com")).score).toBe(0);
    expect(outdatedLabelling(run("Die Regel ist weggefallen [S1]."), { mustLabelOutdated: true }).score).toBe(1);
    expect(outdatedLabelling(run("Ja, nach drei Jahren [S1]."), { mustLabelOutdated: true }).score).toBe(0);
    expect(clarification(run("Seit wie vielen Jahren leben Sie in Deutschland?"), { mustAskClarification: true }).score).toBe(1);
    expect(clarification(run("Fünf Jahre."), { mustAskClarification: true }).score).toBe(0);
    expect(offTopicDecline(run("I must politely decline; my scope is limited to citizenship law.", []), { offTopicDecline: true }).score).toBe(1);
  });

  it("golden set is well-formed", () => {
    const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals/golden.json"), "utf8")) as { cases: Array<{ id: string; lang: string; input: string }> };
    expect(golden.cases.length).toBeGreaterThanOrEqual(24);
    expect(new Set(golden.cases.map((c) => c.id)).size).toBe(golden.cases.length);
    expect(golden.cases.filter((c) => c.lang === "de").length).toBeGreaterThanOrEqual(10);
    expect(golden.cases.filter((c) => c.lang === "en").length).toBeGreaterThanOrEqual(10);
  });
});
