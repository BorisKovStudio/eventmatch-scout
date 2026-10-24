import { randomUUID } from "node:crypto";
import { FalkorDB } from "falkordb";
import {
  ScoutError,
  topics,
  type Brief,
  type Evidence,
  type Person,
} from "./domain.js";

export function databaseOptions(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ScoutError(
      "graph_config",
      "Configure a FalkorDB connection first.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (
    !["redis:", "rediss:"].includes(u.protocol) ||
    (!local && u.protocol !== "rediss:")
  ) {
    throw new ScoutError(
      "graph_tls_required",
      "Remote FalkorDB requires verified TLS. The standard free cloud tier is not suitable.",
    );
  }
  return {
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    socket: {
      host: u.hostname,
      port: Number(u.port || 6379),
      tls: u.protocol === "rediss:",
      ...(process.env.FALKORDB_CA_PEM
        ? { ca: process.env.FALKORDB_CA_PEM }
        : {}),
      connectTimeout: 6000,
      reconnectStrategy: false as const,
    },
  };
}
export async function database() {
  const raw = process.env.FALKORDB_URL;
  if (!raw)
    throw new ScoutError(
      "graph_not_configured",
      "FalkorDB is not connected. No graph results have been simulated.",
    );
  const db = await FalkorDB.connect(databaseOptions(raw));
  db.on("error", () => {});
  return db;
}
export const MATCH_QUERY = `MATCH (b:Brief)-[:NEEDS]->(t:Topic)<-[:MENTIONS]-(d:Document)<-[:HAS_SOURCE]-(c:Company)<-[:PROFILE_ASSOCIATION]-(p:Person)-[:LISTED_AT]->(e:Event)
WHERE b.id = $brief AND t.id = $topic AND NOT toLower(c.name) IN $known
RETURN p.id AS personId, p.name AS name, p.headline AS headline, c.name AS company,
       p.source AS affiliationSource, t.label AS topic, d.url AS source, d.excerpt AS excerpt,
       d.retrievedAt AS retrievedAt, d.mode AS evidenceMode, e.title AS event
ORDER BY p.name LIMIT 3`;

export async function findPaths(
  people: Person[],
  evidence: Evidence[],
  brief: Brief,
  event: { id: string; title: string },
  runId: string = randomUUID(),
) {
  const db = await database();
  const graph = db.selectGraph(`scout_run_${runId.replaceAll("-", "")}`);
  try {
    await graph.query(
      "CREATE (:Brief {id:$id, name:$name, goal:$goal}), (:Event {id:$event, title:$title})",
      {
        params: {
          id: runId,
          name: brief.name,
          goal: brief.goal,
          event: event.id,
          title: event.title,
        },
        TIMEOUT: 3000,
      },
    );
    for (const [id, spec] of Object.entries(topics)) {
      await graph.query(
        "MATCH (b:Brief {id:$brief}) MERGE (t:Topic {id:$id}) SET t.label=$label WITH b,t WHERE t.id=$selected MERGE (b)-[:NEEDS]->(t)",
        {
          params: {
            brief: runId,
            id,
            label: spec.label,
            selected: brief.topic,
          },
          TIMEOUT: 3000,
        },
      );
    }
    for (const p of people.filter((p) => p.company && p.affiliationSource)) {
      await graph.query(
        `MATCH (e:Event {id:$event}) MERGE (c:Company {name:$company})
        CREATE (p:Person {id:$id, name:$name, headline:$headline, source:$source})
        CREATE (p)-[:PROFILE_ASSOCIATION]->(c), (p)-[:LISTED_AT]->(e)`,
        {
          params: {
            event: event.id,
            company: p.company,
            id: p.id,
            name: p.name,
            headline: p.headline,
            source: p.affiliationSource,
          },
          TIMEOUT: 3000,
        },
      );
    }
    for (const d of evidence) {
      await graph.query(
        `MATCH (c:Company {name:$company}), (t:Topic {id:$topic})
        CREATE (d:Document {url:$url, excerpt:$excerpt, retrievedAt:$retrievedAt, mode:$mode})
        CREATE (c)-[:HAS_SOURCE]->(d), (d)-[:MENTIONS]->(t)`,
        {
          params: {
            company: d.company,
            topic: d.topic,
            url: d.url,
            excerpt: d.excerpt,
            retrievedAt: d.retrievedAt,
            mode: d.mode,
          },
          TIMEOUT: 3000,
        },
      );
    }
    const result = await graph.roQuery<Record<string, unknown>>(MATCH_QUERY, {
      params: {
        brief: runId,
        topic: brief.topic,
        known: brief.knownCompanies.map((c) => c.toLowerCase()),
      },
      TIMEOUT: 3000,
    });
    return {
      runId,
      matches: result.data ?? [],
      query: MATCH_QUERY,
      caveat:
        "Document mentions are evidence of published wording, not proof of technical compatibility, buying intent, or physical attendance.",
    };
  } finally {
    // Run-scoped private graphs are intentionally ephemeral in this single-operator MVP.
    await graph.delete().catch(() => {});
    await db.close().catch(() => {});
  }
}
