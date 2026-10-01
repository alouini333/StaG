/** Tiny argv helper shared by the scripts (no dependency). */
export function parseArgs(argv: string[]): { flags: Record<string, string | boolean | string[]>; positional: string[] } {
  const flags: Record<string, string | boolean | string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith("--") ? (i++, next) : true;
    const existing = flags[key];
    if (existing === undefined) flags[key] = value;
    else if (Array.isArray(existing)) existing.push(String(value));
    else flags[key] = [String(existing), String(value)];
  }
  return { flags, positional };
}

export function listFlag(value: string | boolean | string[] | undefined): string[] | undefined {
  if (value === undefined || value === true) return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean);
}

export function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows)";
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  return [line(columns), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(columns.map((c) => cell(r[c]))))].join("\n");
}
