import { personFromApi } from "../src/eventmatch-api.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  publicSource,
  evidenceFor,
  deduplicatePeople,
  DEMO_PEOPLE,
} from "../src/domain.js";
import { databaseOptions, MATCH_QUERY } from "../src/graph.js";
test("reviewed sources reject credentials, query tokens, numeric IPs and local names", () => {
  for (const bad of [
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/?token=secret",
    "https://127.0.0.1",
    "https://metadata.internal",
  ])
    assert.equal(publicSource(bad), null);
  assert.equal(
    publicSource("https://docs.falkordb.com/getting-started/"),
    "https://docs.falkordb.com/getting-started/",
  );
});
test("remote plaintext database connections are refused", () => {
  assert.throws(
    () => databaseOptions("redis://public.example.com:6379"),
    /verified TLS/,
  );
  assert.equal(databaseOptions("redis://127.0.0.1:6381").socket.tls, false);
  assert.equal(
    databaseOptions("rediss://public.example.com:6380").socket.tls,
    true,
  );
});
test("source extraction uses published text, not executable scripts", () => {
  assert.equal(
    evidenceFor(
      "Sample",
      "https://example.com",
      "<script>MCP</script><p>Nothing relevant</p>",
      "synthetic",
    ).length,
    0,
  );
  const e = evidenceFor(
    "Sample",
    "https://example.com",
    "Published MCP documentation",
    "synthetic",
  );
  assert.equal(e.length, 1);
  assert.equal(e[0].topic, "mcp");
  assert.equal(e[0].mode, "synthetic");
});
test("shortlist is bounded and graph query excludes private known companies using parameters", () => {
  assert.equal(deduplicatePeople([...DEMO_PEOPLE, ...DEMO_PEOPLE]).length, 3);
  assert(MATCH_QUERY.includes("$known"));
  assert(MATCH_QUERY.includes("$topic"));
  assert(MATCH_QUERY.includes("PROFILE_ASSOCIATION"));
});

test("API profiles require a confirmed identity, company and permitted provenance", () => {
  const person = {
    id: "12345678-1234-1234-1234-123456789012",
    name: "Demo",
    company: "Sample",
    identity_status: "confirmed",
    source_kind: "manual",
  };
  assert(personFromApi({ person }));
  assert.equal(personFromApi({ person: { ...person, company: "" } }), null);
  assert.equal(
    personFromApi({ person: { ...person, source_kind: "unknown" } }),
    null,
  );
  assert.equal(
    personFromApi({
      person: { ...person, identity_status: "review_required" },
    }),
    null,
  );
});

test("an explicit employer in the role is reported, but a general company mention is not an affiliation", () => {
  const p = {
    id: "12345678-1234-1234-1234-123456789012",
    name: "Demo",
    company: "",
    identity_status: "confirmed",
    source_kind: "authorized_directory",
  };
  assert.equal(
    personFromApi({ person: { ...p, role: "Account executive at FalkorDB" } })
      ?.company,
    "FalkorDB",
  );
  assert.equal(
    personFromApi({ person: { ...p, role: "Interested in FalkorDB" } }),
    null,
  );
});
