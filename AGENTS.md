# Scout

Communicate with Boris in English by default to practice English, especially technical understanding and interviews. Use Russian only when Boris explicitly requests a translation, and translate only the requested part. Ask clarifying questions in English when his meaning is unclear. Write code and code comments in English. Preserve commands, paths, filenames, domains, and identifiers verbatim.

Scout is an independent, single-operator hackathon application. EventMatch is a read-only external REST API data provider, never the deployment target. FalkorDB executes the recommendation query. Never present synthetic inputs, cached sources or simulated provider calls as live.

Stack: Node.js 22+, TypeScript, Express, external EventMatch REST API, official FalkorDB client. Commands: `npm install`, `npm run typecheck`, `npm test`, `npm run dev`. `src/index.ts` is the HTTP entry point. Run focused local checks; do not add CI, broad regressions, new paid plans or expensive infrastructure without approval.

Files: `src/domain.ts` defines contracts and synthetic fixtures; `src/eventmatch-api.ts` contains bounded GET-only API reads; `src/brightdata.ts` handles reviewed public-source retrieval and request reservations; `src/graph.ts` enforces TLS and executes parameterized Cypher; `src/store.ts` encrypts private state; `public/` is the workspace.

The hosted app depends on Vercel Authentication on the exact immutable VERCEL_URL deployment hostname. Private API routes reject the ordinary production alias and every other hostname, and require the explicit protected-deployment configuration. The standard production alias was observed to be public; never assume its protection. Never disable protection or certificate verification to make a demo work. A public source repository does not authorize public access to private application data.

The EventMatch schema is `/developer-api/openapi.json`. Use an API-enabled workspace key with read scopes only. Never bypass Full-plan, source-rights, event allowlist, tenant, privacy or quota gates. API visibility does not prove employment or attendance. Do not extract another client's MCP or OAuth tokens.

Bright Data receives only reviewed public company/project URLs—not private briefs, notes, EventMatch directory records or contact datasets. Confirm credentials, account, zone, current price and spending approval before live calls. Keep durable request reservations; unknown paid outcomes must not be blindly replayed. The request ceiling supplements, but does not replace, the approved monetary budget.

Public source contains code and synthetic fixtures only. Keep credentials, actual API responses, real People records, private briefs, production trust material, runtime files and infrastructure receipts out of Git. Secrets belong in protected runtime configuration or a secret manager. Remote FalkorDB must require authenticated, verified TLS; never expose a plaintext listener. Infrastructure approvals and operator receipts are retained separately and are not blanket permission to resize, publish or change billing.
