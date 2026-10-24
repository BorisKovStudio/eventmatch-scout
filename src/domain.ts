export const EVENT_ID = "42918562-769f-4ece-9b3a-1c3d02fce23a";
export const topics = {
  mcp: {
    label: "MCP integrations",
    pattern: /\bMCP\b|model context protocol/i,
  },
  graph: {
    label: "Graph reasoning",
    pattern: /\bgraph(?:s| database| reasoning)?\b|\bCypher\b/i,
  },
  web: {
    label: "Public web research",
    pattern: /web (?:data|scrap|research)|web unlocker|SERP/i,
  },
} as const;
export type Topic = keyof typeof topics;
export type Person = {
  id: string;
  name: string;
  headline: string;
  company: string;
  affiliationSource: string;
};
export type Evidence = {
  company: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  topic: Topic;
  mode: "synthetic" | "brightdata";
};
export type Brief = {
  name: string;
  goal: string;
  topic: Topic;
  knownCompanies: string[];
};
export type Trace = {
  tool: string;
  status: "complete" | "skipped";
  detail: string;
  durationMs: number;
};
export class ScoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function publicSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.hostname.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) ||
      /^[\d.:\[\]]+$/.test(u.hostname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function deduplicatePeople(people: Person[]): Person[] {
  return [
    ...new Map(
      people.filter((p) => p.id && p.name).map((p) => [p.id, p]),
    ).values(),
  ].slice(0, 10);
}
export function evidenceFor(
  company: string,
  url: string,
  text: string,
  mode: Evidence["mode"],
): Evidence[] {
  const clean = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(
      /<(?:nav|header|footer)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer)>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (Object.entries(topics) as [Topic, (typeof topics)[Topic]][]).flatMap(
    ([topic, spec]) => {
      const match = spec.pattern.exec(clean);
      return match
        ? [
            {
              company,
              url,
              title: `${company}: public documentation`,
              excerpt: clean.slice(
                Math.max(0, match.index - 90),
                match.index + 220,
              ),
              retrievedAt: new Date().toISOString(),
              topic,
              mode,
            },
          ]
        : [];
    },
  );
}
export const DEMO_BRIEF: Brief = {
  name: "EventMatch · demonstration brief",
  goal: "Find a technical integration partner. Prefer new connections; verify every claim before a conversation.",
  topic: "mcp",
  knownCompanies: ["Sample Existing Partner"],
};
export const DEMO_PEOPLE: Person[] = [
  {
    id: "demo-avery",
    name: "Avery Demo",
    headline: "Developer tools engineer",
    company: "Sample Tool Works",
    affiliationSource: "https://example.com/demo/avery",
  },
  {
    id: "demo-jordan",
    name: "Jordan Example",
    headline: "Graph infrastructure engineer",
    company: "Sample Graph Lab",
    affiliationSource: "https://example.com/demo/jordan",
  },
  {
    id: "demo-sam",
    name: "Sam Synthetic",
    headline: "Integration engineer",
    company: "Sample Existing Partner",
    affiliationSource: "https://example.com/demo/sam",
  },
];
export function demoEvidence(): Evidence[] {
  return [
    ...evidenceFor(
      "Sample Tool Works",
      "https://example.com/demo/tool-docs",
      "Synthetic documentation: this demonstration project mentions MCP and public web data.",
      "synthetic",
    ),
    ...evidenceFor(
      "Sample Graph Lab",
      "https://example.com/demo/graph-docs",
      "Synthetic documentation: graph database queries with Cypher.",
      "synthetic",
    ),
    ...evidenceFor(
      "Sample Existing Partner",
      "https://example.com/demo/partner-docs",
      "Synthetic documentation: MCP integration.",
      "synthetic",
    ),
  ];
}
