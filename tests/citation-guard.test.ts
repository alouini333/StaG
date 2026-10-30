import { describe, expect, it } from "vitest";
import { CitationGuard } from "@/mastra/processors/citation-guard";

describe("CitationGuard.processOutputResult", () => {
  it("strips unknown ids and non-retrieved urls from assistant text parts only", async () => {
    const guard = new CitationGuard();
    const messages = [
      { role: "user", content: { format: 2, parts: [{ type: "text", text: "Frage [S9]" }] } },
      { role: "assistant", content: { format: 2, parts: [{ type: "text", text: "Fünf Jahre [S1] und [S7]. Mehr: https://evil.example/x und https://www.gesetze-im-internet.de/stag/__10.html" }] } },
    ];
    const result = {
      text: "",
      usage: {},
      finishReason: "stop",
      steps: [{ toolResults: [{ toolName: "searchCitizenshipSources", output: { official: [{ citationId: "S1", url: "https://www.gesetze-im-internet.de/stag/__10.html" }], community: [] } }] }],
    };
    const out = await guard.processOutputResult({ messages, result } as never);
    const assistant = out[1].content as { parts: Array<{ text: string }> };
    expect(assistant.parts[0].text).toBe("Fünf Jahre [S1] und. Mehr: [Link entfernt / link removed] und https://www.gesetze-im-internet.de/stag/__10.html");
    expect((out[0].content as { parts: Array<{ text: string }> }).parts[0].text).toBe("Frage [S9]");
  });
});
