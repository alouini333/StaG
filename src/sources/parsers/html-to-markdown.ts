import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { detectStand, type StandInfo } from "./stand";

export type ParsedPage = {
  url: string;
  title: string;
  markdown: string;
  stand: StandInfo;
};

const NOISE_SELECTOR = [
  "script", "style", "noscript", "nav", "header", "footer", "aside", "form", "iframe", "svg", "button",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[role=search]", "[role=dialog]",
  ".robots-nocontent", "[data-nosnippet]", "[class*=cookie]", "[id*=cookie]", "[class*=breadcrumb]", "[class*=skiplink]",
  "[class*=socialshare]", "[class*=share]", ".rs_skip", "#readspeaker_button_content",
].join(",");

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" });
turndown.remove(["img", "picture", "video", "audio"]);

export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[\s*\]\([^)]*\)/g, "")
    // turndown pads list markers ("-   item", "1.  item"); normalise to a single space
    .replace(/^(\s*)([-*]|\d+\.)[ \t]{2,}/gm, "$1$2 ")
    .trim();
}

/**
 * Extracts the main content of an official web page as Markdown. Uses the
 * configured selector; falls back to Readability, then <body>. Relative links
 * are made absolute so citations can deep-link.
 */
export function htmlToMarkdown(
  html: string,
  options: { url: string; contentSelector?: string; lastModified?: string | null; fetchedAt: string },
): ParsedPage {
  const { document } = parseHTML(html);
  const pageTitle = document.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim() ?? options.url;

  let container: Element | null = options.contentSelector ? document.querySelector(options.contentSelector) : null;
  if (!container) {
    try {
      const article = new Readability(document.cloneNode(true) as unknown as Document).parse();
      if (article?.content) {
        const { document: articleDoc } = parseHTML(`<html><body>${article.content}</body></html>`);
        container = articleDoc.body;
      }
    } catch {
      container = null;
    }
  }
  container ??= document.body;

  for (const node of Array.from(container.querySelectorAll(NOISE_SELECTOR))) node.remove();
  for (const anchor of Array.from(container.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) {
      anchor.removeAttribute("href");
      continue;
    }
    try {
      anchor.setAttribute("href", new URL(href, options.url).toString());
    } catch {
      anchor.removeAttribute("href");
    }
  }

  const h1 = container.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
  const title = (h1 && h1.length > 3 ? h1 : pageTitle).replace(/\s*[-–|]\s*(BVA|BMI|BAMF|Berlin\.de)\s*$/i, "").trim();
  const markdown = cleanMarkdown(turndown.turndown(container.innerHTML));
  const stand = detectStand({ text: container.textContent ?? "", lastModified: options.lastModified, fetchedAt: options.fetchedAt });
  return { url: options.url, title, markdown, stand };
}
