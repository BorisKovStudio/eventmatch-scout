# Scout

An independent event-connection workspace built on the **EventMatch external developer API**, **Bright Data Web Unlocker**, and **FalkorDB**.

> Private requirements + authorized People + public evidence → explainable connection paths.

## One scenario

1. Open Scout and enter a demo-safe business brief.
2. Select a connection lens: MCP integrations, graph reasoning, or public-web research.
3. Choose today's real event or the explicitly labelled synthetic rehearsal.
4. Scout reads a bounded shortlist from EventMatch, retrieves reviewed public company/project sources through Bright Data, and executes a real multi-hop Cypher query in FalkorDB.
5. Inspect the returned path, original source, retrieval time, unknowns, conversation question and actual tool activity under one Run ID.

**No outreach is sent. No registration is performed. No attendance or buying intent is inferred.** A document keyword mention is not a compatibility claim. Company associations are reported profile information, not independently certified employment.

## Architecture

```text
Protected browser workspace
          |
     Scout / Node.js on Vercel
          |--- EventMatch external API (GET reads only)
          |--- Bright Data (reviewed public URLs only)
          `--- FalkorDB (verified TLS + dedicated ACL)
                 |--- run-scoped reasoning graph
                 `--- encrypted credentials/results + bounded request reservations
```

Scout does not modify the EventMatch application. It uses no EventMatch monorepo code. FalkorDB runs separately; Vercel does not host the persistent database.

## Run locally

Requires Node.js 22+, a FalkorDB instance and a 32-byte server-only encryption key.

```sh
npm install
npm run typecheck
npm test
npm run dev
```

Set the variables documented in `.env.example` in the process environment. `tsx` does not load this example file. For local-only development, plaintext Redis is accepted only on loopback; every remote database connection requires TLS. A private-CA deployment additionally needs the CA certificate in `FALKORDB_CA_PEM`. Never disable certificate verification.

The dev server binds only to `127.0.0.1:3107`. Hosted private APIs require `SCOUT_PROTECTION_MODE=vercel-auth`, the exact immutable `VERCEL_URL` hostname and **Vercel Authentication enabled on that deployment**. The ordinary production alias redirects the homepage to the protected immutable deployment URL; private API routes refuse the alias itself. Do not remove deployment protection. This is a protected single-operator hackathon MVP, not a multi-user production service.

## API credentials

Open **Connections → Configure API credentials** in the protected app. Enter credentials there, never in chat, screenshots or source files. They are encrypted with AES-256-GCM before storage. Secret values are never returned by the API.

EventMatch requires an existing API-enabled workspace/key, including `account:read`, `events:read`, and `people:read`. The app uses the published `/api/v1/integrations/` contract. Full-plan, source-rights, event allowlist, tenant and quota restrictions are never bypassed. Visible data in the EventMatch application does not automatically establish commercial API export permission.

Bright Data requires an existing Web Unlocker zone and a dedicated authorized API key. Live calls are disabled until the exact account, pricing and approved budget are confirmed. Public company/project URLs are selected from a reviewed server-side catalog; private briefs, notes, identities and EventMatch directory records are not sent to Bright Data. There is no LinkedIn people/contact dataset extraction.

## Graph and limits

The real query joins a Brief, Topic, Document, Company, Person and Event. It excludes companies the private brief already knows and returns at most three paths. All user values are Cypher parameters. An optional server-only `SCOUT_PERSON_IDS` list selects existing People explicitly; otherwise the first API page is used. The first version inspects at most ten API People records and at most three company sources, so it is not an exhaustive ranking of the event.

No missing identity or company is invented. Unverified identities and unknown provenance are excluded. An explicit employer phrase such as “Account executive at Company” may supply a reported association when the dedicated company field is empty; a general company mention never does. No source or no supported path is an honest empty result, not a synthetic fallback.

Each live source has a durable request reservation. Unknown paid outcomes are not automatically replayed. A completed retrieval can be reused with its original timestamp and an explicit retained-evidence label. A separate irreversible five-request ceiling supplements the provider budget; it is not a billing-system dollar cap.

## Demonstration boundaries

**Synthetic rehearsal:** People and public evidence are synthetic; the FalkorDB engine and query are real. Synthetic inputs never masquerade as today's actual directory.

**Live mode:** requires legitimate EventMatch API access and Bright Data authorization. It must pass the same UI-to-result chain before being described as verified. The hosted graph rehearsal is not proof that the real EventMatch/Bright Data chain has passed.

## Project files

- `src/index.ts`: bounded HTTP workflow, same-origin writes and safe errors.
- `src/eventmatch-api.ts`: external developer API reads.
- `src/brightdata.ts`: reviewed public-source retrieval, caching and request ceilings.
- `src/graph.ts`: verified TLS client and real Cypher reasoning.
- `src/store.ts`: encrypted single-operator state and durable reservations.
- `public/`: accessible workspace, evidence paths and actual tool receipts.
- `test/`: focused privacy, provenance, transport and query regressions.

Only code and synthetic fixtures belong in this repository. Keep production trust material, credentials, API responses, real People records, private briefs and operator infrastructure receipts out of Git.
