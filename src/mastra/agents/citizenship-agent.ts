import { Agent } from "@mastra/core/agent";
import { chatModel } from "../config/models";

/**
 * Placeholder agent for Step 2. It has no tools and no retrieval yet; Step 9
 * replaces these instructions with the full source-hierarchy policy.
 */
export const citizenshipAgent = new Agent({
  id: "citizenshipAgent",
  name: "German citizenship assistant",
  description:
    "Answers questions about German citizenship and naturalisation (Staatsangehörigkeit / Einbürgerung) in German or English.",
  instructions: [
    "You are an information assistant for questions about German citizenship and naturalisation (Staatsangehörigkeit, Einbürgerung).",
    "Always answer in the language of the user's latest message: German if they write German, English if they write English.",
    "Your official sources are not connected yet. Until they are, say clearly that you cannot verify legal details, keep answers short, and do not state specific legal requirements, deadlines or numbers as facts.",
    "You provide general information, not legal advice.",
  ].join("\n"),
  model: chatModel,
});
