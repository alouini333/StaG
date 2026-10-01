import { sourceDefinitionSchema, type SourceDefinition, type SourceDefinitionInput } from "./types";

const GII = "https://www.gesetze-im-internet.de";
const BMI = "https://www.bmi.bund.de";
const BVA = "https://www.bva.bund.de";
const BVA_DL = `${BVA}/SharedDocs/Downloads/DE/Buerger/Ausweis-Dokumente-Recht/Staatsangehoerigkeit`;
const BVA_DE = `${BVA}/DE/Services/Buerger/Ausweis-Dokumente-Recht/Staatsangehoerigkeit`;

const publishers = {
  bgbl: "Bundesgesetzblatt (BGBl.)",
  bmi: "Bundesministerium des Innern (BMI)",
  bva: "Bundesverwaltungsamt (BVA)",
  bamf: "Bundesamt für Migration und Flüchtlinge (BAMF)",
  ib: "Beauftragte der Bundesregierung für Migration, Flüchtlinge und Integration",
  berlin: "Land Berlin – Landesamt für Einwanderung (LEA)",
};

/**
 * Curated list of sources. Adding a source = adding an entry here (see README
 * "Adding a source"). Crawl delays follow each site's robots.txt (BMI/BVA 10 s,
 * recht.bund.de 30 s). Reddit is NOT a registry source: it is a live
 * CommunityProvider (Step 11).
 *
 * Deliberately excluded: make-it-in-germany.com (bot captcha for non-browser
 * clients), the official English StAG translation (stale: amendments only up to
 * March 2024, still contains the repealed 3-year track), StAR-VwV 2000 (obsolete,
 * references the former Ausländergesetz).
 */
const definitions: SourceDefinitionInput[] = [
  // ------------------------------------------------------------- tier 1: federal law (gesetze-im-internet.de XML)
  {
    id: "stag", tier: 1, kind: "gii-law", title: "Staatsangehörigkeitsgesetz (StAG)", url: `${GII}/stag/`, lang: "de",
    jurisdictionScope: "federal", refreshCadenceDays: 7, options: { lawAbbrev: "StAG", slug: "stag" },
  },
  {
    id: "gg", tier: 1, kind: "gii-law", title: "Grundgesetz (GG) – Art. 16, 116", url: `${GII}/gg/`, lang: "de",
    jurisdictionScope: "federal", refreshCadenceDays: 7, options: { lawAbbrev: "GG", slug: "gg", includeSections: ["art16", "art116"] },
  },
  {
    id: "aufenthg", tier: 1, kind: "gii-law", title: "Aufenthaltsgesetz (AufenthG) – Aufenthaltstitel", url: `${GII}/aufenthg_2004/`, lang: "de",
    jurisdictionScope: "federal", refreshCadenceDays: 7,
    notes: "Only the residence-title provisions relevant for naturalisation.",
    options: { lawAbbrev: "AufenthG", slug: "aufenthg_2004", includeSections: ["4", "5", "7", "8", "9", "9a", "9b", "9c", "18c", "18d", "19c", "23", "25", "26", "28", "30", "38a", "51"] },
  },
  {
    id: "freizuegg", tier: 1, kind: "gii-law", title: "Freizügigkeitsgesetz/EU (FreizügG/EU)", url: `${GII}/freiz_gg_eu_2004/`, lang: "de",
    jurisdictionScope: "federal", refreshCadenceDays: 7, options: { lawAbbrev: "FreizügG/EU", slug: "freiz_gg_eu_2004", includeSections: ["2", "4a", "5"] },
  },
  {
    id: "einbtestv", tier: 1, kind: "gii-law", title: "Einbürgerungstestverordnung (EinbTestV)", url: `${GII}/einbtestv/`, lang: "de",
    jurisdictionScope: "federal", refreshCadenceDays: 30, options: { lawAbbrev: "EinbTestV", slug: "einbtestv" },
  },
  // ------------------------------------------------------------- tier 1: amending acts (official BGBl PDFs; crawl-delay 30 s)
  {
    id: "bgbl-2024-104", tier: 1, kind: "pdf", title: "BGBl. 2024 I Nr. 104 – Gesetz zur Modernisierung des Staatsangehörigkeitsrechts (StARModG)", publisher: publishers.bgbl,
    url: "https://www.recht.bund.de/bgbl/1/2024/104/VO.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 90,
    options: { urls: ["https://www.recht.bund.de/bgbl/1/2024/104/regelungstext.pdf?__blob=publicationFile&v=1"], standOverride: "BGBl. 2024 I Nr. 104, verkündet am 26.03.2024, in Kraft ab 27.06.2024", crawlDelayMs: 30000 },
  },
  {
    id: "bgbl-2025-256", tier: 1, kind: "pdf", title: "BGBl. 2025 I Nr. 256 – Gesetz zur Änderung des Staatsangehörigkeitsgesetzes (Aufhebung § 10 Abs. 3)", publisher: publishers.bgbl,
    url: "https://www.recht.bund.de/bgbl/1/2025/256/VO.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 90,
    options: { urls: ["https://www.recht.bund.de/bgbl/1/2025/256/regelungstext.pdf?__blob=publicationFile&v=1"], standOverride: "BGBl. 2025 I Nr. 256, verkündet am 29.10.2025, in Kraft ab 30.10.2025", crawlDelayMs: 30000 },
  },
  {
    id: "bgbl-2025-364", tier: 1, kind: "pdf", title: "BGBl. 2025 I Nr. 364 – Gesetz zur Bestimmung sicherer Herkunftsstaaten (u. a. § 35a StAG)", publisher: publishers.bgbl,
    url: "https://www.recht.bund.de/bgbl/1/2025/364/VO.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 90,
    options: { urls: ["https://www.recht.bund.de/bgbl/1/2025/364/regelungstext.pdf?__blob=publicationFile&v=1"], standOverride: "BGBl. 2025 I Nr. 364, verkündet am 23.12.2025", crawlDelayMs: 30000 },
  },
  {
    id: "bgbl-2026-221", tier: 1, kind: "pdf", title: "BGBl. 2026 I Nr. 221 – Gesetz zur besseren Verhinderung missbräuchlicher Vaterschaftsanerkennungen (u. a. § 17 StAG)", publisher: publishers.bgbl,
    url: "https://www.recht.bund.de/bgbl/1/2026/221/VO.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 90,
    options: { urls: ["https://www.recht.bund.de/bgbl/1/2026/221/regelungstext.pdf?__blob=publicationFile&v=1"], standOverride: "BGBl. 2026 I Nr. 221, verkündet am 28.07.2026, in Kraft ab 29.07.2026", crawlDelayMs: 30000 },
  },
  // ------------------------------------------------------------- tier 2: federal authorities (HTML)
  {
    id: "bmi-staatsangehoerigkeit-de", tier: 2, kind: "html-page", title: "BMI – Staatsangehörigkeit und Einbürgerung", publisher: publishers.bmi,
    url: `${BMI}/DE/themen/verfassung/staatsangehoerigkeit/staatsangehoerigkeit-node.html`, lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 14,
    notes: "The reform FAQ is known to lag behind the law (still mentions the repealed 3-year track); the outdated-page rule handles it.",
    options: {
      urls: [
        `${BMI}/DE/themen/verfassung/staatsangehoerigkeit/staatsangehoerigkeit-node.html`,
        `${BMI}/DE/themen/verfassung/staatsangehoerigkeit/staatsangehoerigkeitsrecht/staatsangehoerigkeitsrecht-node.html`,
        `${BMI}/DE/themen/verfassung/staatsangehoerigkeit/einbuergerung/einbuergerung-node.html`,
        `${BMI}/SharedDocs/faqs/DE/themen/heimat/reform-staatsangehoerigkeitsrecht/reform-staatsangehoerigkeitsrecht-liste.html`,
      ],
      contentSelector: "#content", cookieBootstrapUrl: `${BMI}/`, crawlDelayMs: 10000,
    },
  },
  {
    id: "bmi-nationality-en", tier: 2, kind: "html-page", title: "BMI – Nationality and naturalisation (English)", publisher: publishers.bmi,
    url: `${BMI}/EN/topics/constitution/nationality/nationality-node.html`, lang: "en", jurisdictionScope: "federal", refreshCadenceDays: 14,
    options: {
      urls: [
        `${BMI}/EN/topics/constitution/nationality/nationality-node.html`,
        `${BMI}/EN/topics/constitution/nationality/nationality-law/nationality-law-node.html`,
        `${BMI}/EN/topics/constitution/nationality/naturalization/naturalisation-node.html`,
        `${BMI}/EN/topics/constitution/nationality/birth-in-germany/birth-in-germany-node.html`,
      ],
      contentSelector: "#content", cookieBootstrapUrl: `${BMI}/`, crawlDelayMs: 10000,
    },
  },
  {
    id: "bva-staatsangehoerigkeit-de", tier: 2, kind: "html-page", title: "BVA – Staatsangehörigkeit, Einbürgerung aus dem Ausland, Feststellung", publisher: publishers.bva,
    url: `${BVA_DE}/staatsangehoerigkeit_node.html`, lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 14,
    options: {
      urls: [
        `${BVA_DE}/staatsangehoerigkeit_node.html`,
        `${BVA_DE}/Einbuergerung/Einbuergerung_node.html`,
        `${BVA_DE}/Einbuergerung/Ermessen13/Einbuergerung13_node.html`,
        `${BVA_DE}/Einbuergerung/Ermessen14/Einbuergerung14_node.html`,
        `${BVA_DE}/Einbuergerung/EER/Einbuergerung_EER_node.html`,
        `${BVA_DE}/Einbuergerung/Anspruch/EinbuergerungA_node.html`,
        `${BVA_DE}/Einbuergerung/EB15/Einbuergerung15_node.html`,
        `${BVA_DE}/Feststellung_Start/Feststellung1_node.html`,
      ],
      contentSelector: "#content", crawlDelayMs: 10000,
    },
  },
  {
    id: "bva-citizenship-en", tier: 2, kind: "html-page", title: "BVA – Citizenship (English)", publisher: publishers.bva,
    url: `${BVA}/EN/Services/Citizens/ID-Documents-Law/Citizenship/citizenship_node.html`, lang: "en", jurisdictionScope: "federal", refreshCadenceDays: 14,
    options: { urls: [`${BVA}/EN/Services/Citizens/ID-Documents-Law/Citizenship/citizenship_node.html`], contentSelector: "#content", crawlDelayMs: 10000 },
  },
  {
    id: "bamf-einbuergerungstest-de", tier: 2, kind: "html-page", title: "BAMF – Einbürgerungstest", publisher: publishers.bamf,
    url: "https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: ["https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html"], contentSelector: "#content", crawlDelayMs: 2000 },
  },
  {
    id: "bamf-naturalisation-test-en", tier: 2, kind: "html-page", title: "BAMF – Naturalisation test (English)", publisher: publishers.bamf,
    url: "https://www.bamf.de/EN/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html", lang: "en", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: ["https://www.bamf.de/EN/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html"], contentSelector: "#content", crawlDelayMs: 2000 },
  },
  {
    id: "integrationsbeauftragte-einbuergerung", tier: 2, kind: "html-page", title: "Integrationsbeauftragte – Der Weg zur deutschen Staatsangehörigkeit", publisher: publishers.ib,
    url: "https://www.integrationsbeauftragte.de/integration/einbuergerung", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: ["https://www.integrationsbeauftragte.de/integration/einbuergerung"], contentSelector: "main", crawlDelayMs: 2000 },
  },
  {
    id: "einbuergerung-de-portal-de", tier: 2, kind: "html-page", title: "einbürgerung.de – Portal der Bundesregierung zur Einbürgerung", publisher: publishers.ib,
    url: "https://www.xn--einbrgerung-whb.de/", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: ["https://www.xn--einbrgerung-whb.de/", "https://www.xn--einbrgerung-whb.de/service.php"], contentSelector: "#main-content", crawlDelayMs: 2000 },
  },
  {
    id: "einbuergerung-de-portal-en", tier: 2, kind: "html-page", title: "einbürgerung.de – The path to a German passport (English)", publisher: publishers.ib,
    url: "https://www.xn--einbrgerung-whb.de/?l=en", lang: "en", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: ["https://www.xn--einbrgerung-whb.de/?l=en"], contentSelector: "#main-content", crawlDelayMs: 2000 },
  },
  // ------------------------------------------------------------- tier 2: federal authorities (PDF)
  {
    id: "bmi-ah-stag-2025", tier: 2, kind: "pdf", title: "BMI – Anwendungshinweise zum Staatsangehörigkeitsgesetz (AH-StAG 2025)", publisher: publishers.bmi,
    url: `${BMI}/DE/themen/verfassung/staatsangehoerigkeit/staatsangehoerigkeitsrecht/staatsangehoerigkeitsrecht-node.html`, lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    notes: "Stand 1 May 2025: predates the repeal of § 10 Abs. 3 StAG (30 Oct 2025).",
    options: {
      urls: [`${BMI}/SharedDocs/downloads/DE/veroeffentlichungen/themen/verfassung/staatsangehoerigkeit/2505_anwendungshinweise-staatsangehoerigkeit.pdf?__blob=publicationFile&v=6`],
      standOverride: "Stand: 1. Mai 2025 (vor Aufhebung von § 10 Abs. 3 StAG am 30.10.2025)", sectionNumbering: "ah-stag", cookieBootstrapUrl: `${BMI}/`, crawlDelayMs: 10000,
    },
  },
  {
    id: "bva-merkblaetter-de", tier: 2, kind: "pdf", title: "BVA – Merkblätter (§ 15 StAG, Art. 116 Abs. 2 GG, Erklärungserwerb § 5 StAG, Feststellung)", publisher: publishers.bva,
    url: `${BVA_DE}/staatsangehoerigkeit_node.html`, lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: {
      urls: [
        `${BVA_DL}/Einbuergerung/Ermessen/E15_Merkblatt.pdf?__blob=publicationFile&v=1`,
        `${BVA_DL}/Einbuergerung/Anspruch/Anspruch_Merkblatt.pdf?__blob=publicationFile&v=3`,
        `${BVA_DL}/Einbuergerung/Ermessen/EER_Merkblatt.pdf?__blob=publicationFile&v=1`,
        `${BVA_DL}/Feststellung/MerkblattF.pdf?__blob=publicationFile&v=1`,
      ],
      crawlDelayMs: 10000,
    },
  },
  {
    id: "bva-merkblatt-anspruch-en", tier: 2, kind: "pdf", title: "BVA – Information sheet: restoration of citizenship (Art. 116 (2) Basic Law), English", publisher: publishers.bva,
    url: `${BVA}/EN/Services/Citizens/ID-Documents-Law/Citizenship/citizenship_node.html`, lang: "en", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: { urls: [`${BVA_DL}/Einbuergerung/Anspruch/Anspruch_Merkblatt_englisch.pdf?__blob=publicationFile&v=3`], crawlDelayMs: 10000 },
  },
  {
    id: "integrationsbeauftragte-broschueren", tier: 2, kind: "pdf", title: "Integrationsbeauftragte – „Mein Weg zum deutschen Pass“ und „Überblick Einbürgerung“", publisher: publishers.ib,
    url: "https://www.integrationsbeauftragte.de/integration/einbuergerung", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 30,
    options: {
      urls: [
        "https://www.integrationsbeauftragte.de/fileadmin/Website-Content/Downloads/Startseite/Service/Publikationen/einbuergerung-broschuere-deu-data.pdf",
        "https://www.integrationsbeauftragte.de/fileadmin/Website-Content/Downloads/Startseite/Service/Publikationen/ueberblick-einbuergerung-dt-data.pdf",
      ],
      crawlDelayMs: 2000,
    },
  },
  {
    id: "bamf-gesamtfragenkatalog", tier: 2, kind: "pdf", title: "BAMF – Gesamtfragenkatalog zum Einbürgerungstest", publisher: publishers.bamf,
    url: "https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html", lang: "de", jurisdictionScope: "federal", refreshCadenceDays: 90,
    enabled: false, notes: "9 MB; enable when test-question coverage is wanted.",
    options: { urls: ["https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v=23"], crawlDelayMs: 2000 },
  },
  // ------------------------------------------------------------- tier 3: Land authorities
  {
    id: "berlin-lea-einbuergerung", tier: 3, kind: "html-page", title: "Berlin LEA – Einbürgerung (Antrag, FAQ)", publisher: publishers.berlin,
    url: "https://www.berlin.de/einwanderung/einbuergerung/", lang: "de", jurisdictionScope: "Berlin", refreshCadenceDays: 14,
    options: { urls: ["https://www.berlin.de/einwanderung/einbuergerung/", "https://www.berlin.de/einwanderung/service/faq/"], contentSelector: "#layout-grid__area--maincontent", crawlDelayMs: 3000 },
  },
  {
    id: "berlin-service-einbuergerung", tier: 3, kind: "html-page", title: "Service-Portal Berlin – Einbürgerung (Dienstleistung 318998)", publisher: publishers.berlin,
    url: "https://service.berlin.de/dienstleistung/318998/", lang: "de", jurisdictionScope: "Berlin", refreshCadenceDays: 14,
    options: { urls: ["https://service.berlin.de/dienstleistung/318998/"], crawlDelayMs: 3000 },
  },
  // TODO Step 10: `stag-changes` (law-change-seed, data/law-changes/stag.json).
  // TODO Step 11: `community-notes` (data/community/**/*.md).
];

/** Validates every entry and rejects duplicate IDs. Throws with a readable message. */
export function validateRegistry(input: SourceDefinitionInput[]): SourceDefinition[] {
  const parsed = input.map((entry, index) => {
    const result = sourceDefinitionSchema.safeParse(entry);
    if (!result.success) {
      const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid source definition at index ${index} (${String(entry.id ?? "?")}): ${details}`);
    }
    return result.data;
  });
  const seen = new Set<string>();
  for (const source of parsed) {
    if (seen.has(source.id)) throw new Error(`Duplicate source id in registry: ${source.id}`);
    seen.add(source.id);
    const urls = source.kind === "gii-law" || source.kind === "community-notes" || source.kind === "law-change-seed" ? [source.url] : [source.url, ...source.options.urls];
    for (const u of urls) if (!u.startsWith("https://")) throw new Error(`Source ${source.id}: non-https url ${u}`);
  }
  return parsed;
}

export const registry: SourceDefinition[] = validateRegistry(definitions);

export function getSource(id: string): SourceDefinition {
  const source = registry.find((s) => s.id === id);
  if (!source) throw new Error(`Unknown source id: ${id}`);
  return source;
}

export function enabledSources(ids?: string[]): SourceDefinition[] {
  const chosen = ids?.length ? ids.map(getSource) : registry;
  return chosen.filter((s) => s.enabled);
}
