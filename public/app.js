const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text);
  if (cls) e.className = cls;
  return e;
};
async function request(url, body) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(j.error?.message || "This request could not finish.");
  return j;
}
async function status() {
  try {
    const j = await request("/api/status");
    $("db-status").textContent = j.database
      ? "Connected · verified TLS"
      : "Not connected";
    $("em-status").textContent = j.eventmatch
      ? "Key configured · run verifies access"
      : "API-enabled workspace key required";
    $("bd-status").textContent = j.brightdata
      ? j.brightdataEnabled
        ? "Configured · live calls enabled"
        : "Credentials saved · live calls disabled"
      : "Hackathon key + existing zone required";
  } catch (e) {
    $("db-status").textContent = e.message;
  }
}
$("refresh-status").addEventListener("click", status);
$("credentials-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const values = Object.fromEntries(
    [...new FormData(f)]
      .filter(([, v]) => String(v).trim())
      .map(([k, v]) => [k, String(v).trim()]),
  );
  const b = f.querySelector("button");
  b.disabled = true;
  try {
    const j = await request("/api/connections", values);
    $("credential-status").textContent = j.message;
    f.reset();
    await status();
  } catch (err) {
    $("credential-status").textContent = err.message;
  } finally {
    b.disabled = false;
  }
});
function render(j) {
  $("result-mode").textContent =
    j.mode === "synthetic"
      ? "SYNTHETIC INPUTS · REAL GRAPH"
      : "LIVE API INPUTS";
  $("matches").replaceChildren();
  for (const m of j.matches) {
    const a = node("article", undefined, "match");
    a.append(node("h3", m.name));
    a.append(
      node(
        "p",
        [m.headline, m.company].filter(Boolean).join(" · "),
        "match-role",
      ),
    );
    const ol = node("ol", undefined, "path");
    for (const label of [
      "Private requirement",
      m.topic,
      m.company,
      m.name,
      j.event.title,
    ])
      ol.append(node("li", label));
    a.append(ol);
    const source = node("div", undefined, "source");
    source.append(
      node(
        "strong",
        j.mode === "synthetic"
          ? "Synthetic source"
          : "Published source evidence",
      ),
    );
    if (j.mode !== "synthetic") {
      try {
        const u = new URL(m.source);
        if (u.protocol === "https:") {
          const link = node("a", `Open ${u.hostname} ↗`);
          link.href = u.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          source.append(node("br"), link);
        }
      } catch {}
    }
    source.append(
      node("blockquote", m.excerpt),
      node(
        "small",
        `Retrieved ${new Date(m.retrievedAt).toLocaleString()}. Mentions are not proof of compatibility.`,
      ),
    );
    a.append(source);
    const q = node("div", undefined, "question");
    q.append(
      node("strong", "A question to start with"),
      node(
        "span",
        `Your published material mentions ${m.topic}. Is there a practical integration we could explore for EventMatch?`,
      ),
    );
    a.append(q);
    $("matches").append(a);
  }
  $("empty").hidden = true;
  if (!j.matches.length)
    $("matches").append(
      node(
        "p",
        "No supported paths for this lens. Change the lens or add a reviewed company source; no matches were invented.",
        "source",
      ),
    );
  $("run-summary").hidden = false;
  $("run-summary").textContent =
    `${j.inspected} records inspected · ${j.eligible} eligible profile associations · ${j.evidenceCount} source mentions · Run ${j.runId}. ${j.sourceCaveat || ""}`;
  $("trace").replaceChildren();
  for (const t of j.trace) {
    const li = node("li");
    li.append(
      node("strong", t.tool),
      node("span", `${t.durationMs} ms`, "duration"),
      node("small", t.detail),
    );
    $("trace").append(li);
  }
  $("query-details").hidden = false;
  $("query").textContent = j.query;
}
$("run-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const body = {
    id: crypto.randomUUID(),
    mode: f.get("mode"),
    brief: {
      name: f.get("name"),
      goal: f.get("goal"),
      topic: f.get("topic"),
      knownCompanies: String(f.get("known") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };
  $("run-button").disabled = true;
  $("progress").hidden = false;
  $("run-status").className = "";
  $("run-status").textContent =
    "Running the bounded scenario. Waiting for actual tool results…";
  $("matches").replaceChildren();
  $("run-summary").hidden = true;
  $("query-details").hidden = true;
  $("empty").hidden = true;
  $("trace").replaceChildren(
    node(
      "li",
      "Execution in progress. No completed tool receipts yet.",
      "trace-empty",
    ),
  );
  try {
    const j = await request("/api/run", body);
    render(j);
    $("run-status").textContent =
      j.mode === "synthetic"
        ? "Rehearsal complete: synthetic records queried by the real FalkorDB engine."
        : "Live scenario complete. Review the evidence and unknowns before acting.";
  } catch (err) {
    $("run-status").className = "error";
    $("run-status").textContent = err.message;
    $("result-mode").textContent = "RUN DID NOT COMPLETE";
    $("trace").replaceChildren(
      node(
        "li",
        "The full scenario did not complete. No synthetic fallback was substituted.",
        "trace-empty",
      ),
    );
  } finally {
    $("run-button").disabled = false;
    $("progress").hidden = true;
  }
});
status();
