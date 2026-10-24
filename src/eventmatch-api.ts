import {
  EVENT_ID,
  ScoutError,
  deduplicatePeople,
  type Person,
  type Trace,
} from "./domain.js";
import { credentials } from "./store.js";
const BASE = "https://eventmatch.ai/api/v1/integrations";
export function personFromApi(row: any): Person | null {
  const p = row?.person;
  if (!p) return null;
  const reviewedCompanies = Object.keys(
    JSON.parse(
      process.env.SCOUT_COMPANY_SOURCES_JSON ||
        '{"Bright Data":"","FalkorDB":"","TrueFoundry":""}',
    ),
  );
  const reportedRole = String(p.role || p.headline || "");
  const explicitCompany = reviewedCompanies.find((c) => {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      "(?:\\bat\\s+|\\s@\\s*)" + escaped + "(?:\\s|[|,;]|$)",
      "i",
    ).test(reportedRole);
  });
  const company = String(p.company || explicitCompany || "").trim();
  if (
    !p?.id ||
    !/^[a-f0-9-]{36}$/i.test(p.id) ||
    !p.name ||
    !company ||
    p.identity_status !== "confirmed" ||
    !["manual", "authorized_directory"].includes(p.source_kind)
  )
    return null;
  return {
    id: p.id,
    name: String(p.name).slice(0, 240),
    headline: String(p.headline || p.role || "").slice(0, 500),
    company: company.slice(0, 240),
    affiliationSource: `${BASE}/events/${EVENT_ID}/people/${p.id}/`,
  };
}
export async function loadEventMatchApi(trace: Trace[]) {
  const key =
    (await credentials()).eventmatchKey || process.env.EVENTMATCH_API_KEY;
  if (!key)
    throw new ScoutError(
      "eventmatch_key_required",
      "Add a read-only key from your API-enabled EventMatch workspace in Connections.",
    );
  async function get(path: string) {
    const start = performance.now();
    const r = await fetch(BASE + path, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
    const requestId = r.headers.get("x-request-id");
    if (!r.ok) {
      const codes: Record<number, string> = {
        401: "The EventMatch API key is invalid or expired.",
        402: "This EventMatch workspace needs an active API-enabled plan.",
        403: "EventMatch denied this scope or source export. Scout will not bypass the restriction.",
        404: "This event is not available to the API key. Check its workspace, event allowlist and source permissions.",
        429: "EventMatch rate or quota limit reached. No automatic retry was made.",
      };
      throw new ScoutError(
        "eventmatch_" + r.status,
        (codes[r.status] || "EventMatch API read failed.") +
          (requestId ? ` Request ID: ${requestId}` : ""),
        r.status === 401 ? 400 : 503,
      );
    }
    const text = await r.text();
    if (text.length > 1000000)
      throw new ScoutError(
        "eventmatch_size",
        "EventMatch response exceeded the bounded size.",
      );
    let j: any;
    try {
      j = JSON.parse(text);
    } catch {
      throw new ScoutError(
        "eventmatch_contract",
        "EventMatch returned an unsupported response.",
      );
    }
    if (!("data" in j))
      throw new ScoutError(
        "eventmatch_contract",
        "EventMatch response did not match its published API envelope.",
      );
    trace.push({
      tool: `EventMatch API · GET ${path}`,
      status: "complete",
      detail: `Read completed${requestId ? ` · request ${requestId}` : ""}. No records changed.`,
      durationMs: Math.round(performance.now() - start),
    });
    return j.data;
  }
  const context = await get("/context/");
  if (context.environment !== "live")
    throw new ScoutError(
      "eventmatch_environment",
      "Use a live key for today’s real event. Sandbox records must remain labelled separately.",
    );
  for (const s of ["account:read", "events:read", "people:read"])
    if (!context.scopes?.includes(s))
      throw new ScoutError(
        "eventmatch_scope",
        `The key needs ${s}. No write scopes are required.`,
      );
  const event = await get(`/events/${EVENT_ID}/`);
  const selected = (process.env.SCOUT_PERSON_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-f0-9-]{36}$/i.test(s))
    .slice(0, 10);
  const list = selected.length
    ? await Promise.all(
        selected.map((id) => get(`/events/${EVENT_ID}/people/${id}/`)),
      )
    : await get(`/events/${EVENT_ID}/people/?limit=10`);
  if (!Array.isArray(list))
    throw new ScoutError(
      "eventmatch_contract",
      "EventMatch People response did not match its published schema.",
    );
  const people: Person[] = list
    .map(personFromApi)
    .filter((p): p is Person => p !== null);
  return {
    event: { id: EVENT_ID, title: String(event.title).slice(0, 500) },
    people: deduplicatePeople(people),
    inspected: list.length,
    caveat:
      "Company links are reported by EventMatch profiles, including explicit employer wording in a role field. API visibility does not prove current employment or physical attendance.",
  };
}
