import { credentials, read, reserve, write, fingerprint } from "./store.js";
import { database } from "./graph.js";
import {
  evidenceFor,
  publicSource,
  ScoutError,
  type Evidence,
  type Person,
  type Trace,
} from "./domain.js";

export async function collectEvidence(
  people: Person[],
  trace: Trace[],
): Promise<Evidence[]> {
  if (process.env.BRIGHTDATA_ENABLED !== "true")
    throw new ScoutError(
      "brightdata_approval_required",
      "Bright Data live calls remain disabled until credentials, exact pricing and the spending cap are confirmed.",
    );
  const configured = await credentials();
  const token = configured.brightdataKey || process.env.BRIGHTDATA_API_KEY;
  const zone = configured.brightdataZone || process.env.BRIGHTDATA_ZONE;
  if (!token || !zone)
    throw new ScoutError(
      "brightdata_config",
      "Configure a dedicated Bright Data key and existing Web Unlocker zone.",
    );
  if (zone !== process.env.BRIGHTDATA_APPROVED_ZONE)
    throw new ScoutError(
      "brightdata_zone_not_reviewed",
      "This zone has not been reviewed for the approved pricing and account. No request was sent.",
    );
  const catalog = JSON.parse(
    process.env.SCOUT_COMPANY_SOURCES_JSON ||
      JSON.stringify({
        "Bright Data":
          "https://docs.brightdata.com/products/mcp-server/overview",
        FalkorDB: "https://docs.falkordb.com/genai-tools/mcpserver/quickstart",
        TrueFoundry: "https://trueforge.dev/mcp-servers",
      }),
  ) as Record<string, string>;
  const result: Evidence[] = [];
  const db = await database();
  const budget = db.selectGraph("scout_brightdata_budget_v1");
  try {
    for (const company of [...new Set(people.map((p) => p.company))].slice(
      0,
      3,
    )) {
      const url = publicSource(catalog[company]);
      if (!url) {
        trace.push({
          tool: "Bright Data",
          status: "skipped",
          detail:
            "No reviewed public company/project source for this affiliation.",
          durationMs: 0,
        });
        continue;
      }
      const sourceKey = "source:" + fingerprint(url);
      const cached = await read<Evidence[]>(sourceKey);
      if (cached) {
        result.push(...cached);
        trace.push({
          tool: "Bright Data · retained evidence",
          status: "complete",
          detail:
            "Reused a completed retrieval; not a new live request. Original retrieval time preserved.",
          durationMs: 0,
        });
        continue;
      }
      const intent = await reserve(sourceKey, url);
      if (!intent.acquired)
        throw new ScoutError(
          "source_outcome_uncertain",
          "This source has an unfinished or failed paid request. No paid replay was made.",
        );
      // Independent request ceiling supplements, but never replaces, the provider-side dollar cap.
      const max = Math.min(
        5,
        Math.max(0, Number(process.env.BRIGHTDATA_MAX_REQUESTS || 0)),
      );
      const reservation = await budget.query<{ used: number }>(
        `MERGE (b:Budget {id:'hackathon'}) ON CREATE SET b.used=0
        WITH b WHERE b.used < $max SET b.used=b.used+1 RETURN b.used AS used`,
        { params: { max }, TIMEOUT: 3000 },
      );
      if (!reservation.data?.length)
        throw new ScoutError(
          "brightdata_request_cap",
          "Bright Data request ceiling reached. Unknown outcomes are not automatically retried.",
        );
      const start = performance.now();
      const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zone, url, format: "raw" }),
        signal: AbortSignal.timeout(45000),
        redirect: "error",
      });
      if (!response.ok)
        throw new ScoutError(
          "brightdata_failed",
          "Bright Data retrieval failed. The reserved request was not refunded or retried.",
        );
      const reader = response.body?.getReader();
      if (!reader)
        throw new ScoutError(
          "brightdata_empty",
          "Bright Data returned no page body.",
        );
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1_000_000) {
          await reader.cancel();
          throw new ScoutError(
            "brightdata_size",
            "Public page exceeded the one-megabyte limit.",
          );
        }
        chunks.push(value);
      }
      const extracted = evidenceFor(
        company,
        url,
        Buffer.concat(chunks).toString("utf8"),
        "brightdata",
      );
      await write(sourceKey, extracted);
      result.push(...extracted);
      trace.push({
        tool: "Bright Data · Web Unlocker",
        status: "complete",
        detail: `Retrieved reviewed public source: ${new URL(url).hostname}. Private brief was not transmitted.`,
        durationMs: Math.round(performance.now() - start),
      });
    }
  } finally {
    await db.close().catch(() => {});
  }
  return result;
}
