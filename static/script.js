const $ = (id) => document.getElementById(id);
const MAX = 500;
let mode = "auto";
let requestId = 0;
let lastTranslation = "";

const LANG = { en: "English", de: "Deutsch" };
const CASE_STYLES = {
  nominative: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  accusative: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  dative: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  genitive: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

// Small DOM helper: always uses textContent, so model output can't inject HTML.
function h(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setMode(newMode) {
  mode = newMode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.className =
      "mode-btn px-4 py-2 rounded-lg transition " +
      (active ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white");
  });
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// ---------- Rendering the AI breakdown ----------
function section(title) {
  const wrap = h("div", "mb-6");
  wrap.appendChild(h("h3", "text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2", title));
  return wrap;
}

function caseBadge(label) {
  const key = Object.keys(CASE_STYLES).find((k) => label.toLowerCase().includes(k));
  const style = key ? CASE_STYLES[key] : "bg-slate-700/40 text-slate-300 border-slate-600";
  return h("span", `text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${style}`, label);
}

// Collapsible section built on <details>: native keyboard + screen-reader support.
// Open/closed state is remembered between translations.
const openState = { components: false, verbs: false, nuance: false };

function dropdown(key, title, count) {
  const det = h("details", "group mb-4 rounded-xl border border-slate-800 bg-slate-900/40");
  det.open = openState[key];
  det.addEventListener("toggle", () => { openState[key] = det.open; });

  const sum = h(
    "summary",
    "flex items-center gap-3 cursor-pointer select-none list-none px-4 py-3 rounded-xl " +
      "hover:bg-slate-800/60 transition [&::-webkit-details-marker]:hidden"
  );
  sum.appendChild(h("span", "text-sm font-semibold text-slate-400 uppercase tracking-wider", title));
  sum.appendChild(h("span", "text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300", String(count)));
  sum.appendChild(h("span", "ml-auto text-slate-500 transition-transform group-open:rotate-180", "▾"));
  det.appendChild(sum);

  const body = h("div", "px-4 pb-4");
  det.appendChild(body);
  return { det, body };
}

function renderBreakdown(d) {
  const root = $("breakdown");
  root.replaceChildren();
  if (window.GrammarPanel) window.GrammarPanel.update(d); // feeds this analysis to the search panel

  root.appendChild(h("p", "text-slate-300 mb-6", d.summary));

  // Tense / mood / structure
  const meta = section("Tense, Mood & Structure");
  const grid = h("div", "grid sm:grid-cols-3 gap-3");
  [["Tense", d.tense], ["Mood", d.mood], ["Word order", d.sentence_structure]].forEach(([k, v]) => {
    const card = h("div", "rounded-xl bg-slate-950 border border-slate-800 p-3");
    card.appendChild(h("div", "text-xs text-slate-500 mb-1", k));
    card.appendChild(h("div", "text-sm", v));
    grid.appendChild(card);
  });
  meta.appendChild(grid);
  root.appendChild(meta);

  // Components / cases
  if (d.components?.length) {
    const { det: sec, body } = dropdown("components", "Grammatical Components", d.components.length);
    const list = h("div", "space-y-2");
    d.components.forEach((c) => {
      const row = h("div", "rounded-xl bg-slate-950 border border-slate-800 p-3");
      const top = h("div", "flex flex-wrap items-center gap-2 mb-1");
      top.appendChild(h("span", "font-semibold text-amber-200", c.text));
      top.appendChild(h("span", "text-xs text-slate-500", c.role));
      top.appendChild(caseBadge(c.case_or_form));
      row.appendChild(top);
      row.appendChild(h("p", "text-sm text-slate-400", c.explanation));
      list.appendChild(row);
    });
    body.appendChild(list);
    root.appendChild(sec);
  }

  // Verbs
  if (d.verbs?.length) {
    const { det: sec, body } = dropdown("verbs", "Verbs", d.verbs.length);
    const list = h("div", "space-y-2");
    d.verbs.forEach((v) => {
      const row = h("div", "rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm");
      row.appendChild(h("span", "font-semibold text-indigo-300", v.form));
      row.appendChild(h("span", "text-slate-500", "  ←  "));
      row.appendChild(h("span", "italic", v.infinitive));
      row.appendChild(h("p", "text-slate-400 mt-1", v.conjugation));
      list.appendChild(row);
    });
    body.appendChild(list);
    root.appendChild(sec);
  }

  // Idioms / nuance
  if (d.idioms_and_nuance?.length) {
    const { det: sec, body } = dropdown("nuance", "Idioms & Nuance", d.idioms_and_nuance.length);
    const ul = h("ul", "space-y-2");
    d.idioms_and_nuance.forEach((n) => {
      const li = h("li", "rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-100");
      li.textContent = "⚠ " + n;
      ul.appendChild(li);
    });
    body.appendChild(ul);
    root.appendChild(sec);
  }
}

// ---------- Main flow ----------
async function run() {
  const text = $("input").value.trim();
  if (!text) return;

  const myId = ++requestId; // lets us ignore stale responses
  showError("");
  $("translateBtn").disabled = true;
  $("output").textContent = "Translating…";
  $("copyBtn").classList.add("hidden");
  $("deepDive").classList.add("hidden");
  if (window.GrammarPanel) window.GrammarPanel.update(null); // new sentence: drop the old analysis
  if (window.AlignGraphic) window.AlignGraphic.clear();

  let t;
  try {
    t = await post("/api/translate", { text, mode });
  } catch (e) {
    $("output").textContent = "";
    showError(e.message);
    $("translateBtn").disabled = false;
    return;
  }
  if (myId !== requestId) return;

  lastTranslation = t.translation;
  $("output").textContent = t.translation;
  $("dirLabel").textContent = `${LANG[t.source]} → ${LANG[t.target]}`;
  $("dirLabel").classList.remove("hidden");
  $("copyBtn").classList.remove("hidden");
  $("translateBtn").disabled = false;

  // Word-link graphic runs alongside the deep dive; each is independent and can fail on its own.
  if (window.AlignGraphic) {
    window.AlignMeta = { sourceLabel: `Original · ${LANG[t.source]}`, targetLabel: `Translation · ${LANG[t.target]}` };
    window.AlignGraphic.start();
    post("/api/align", { source_text: text, translation: t.translation, source: t.source })
      .then((data) => { if (myId === requestId) window.AlignGraphic.render(data); })
      .catch((e) => { if (myId === requestId) window.AlignGraphic.fail(e.message); });
  }

  // Async AI deep dive
  $("deepDive").classList.remove("hidden");
  $("breakdown").replaceChildren();
  $("skeleton").classList.remove("hidden");
  $("spinner").classList.remove("hidden");

  try {
    const analysis = await post("/api/analyze", {
      source_text: text,
      translation: t.translation,
      source: t.source,
    });
    if (myId !== requestId) return;
    renderBreakdown(analysis);
  } catch (e) {
    if (myId !== requestId) return;
    const box = h("p", "text-rose-400 text-sm", e.message);
    $("breakdown").replaceChildren(box);
  } finally {
    if (myId === requestId) {
      $("skeleton").classList.add("hidden");
      $("spinner").classList.add("hidden");
    }
  }
}

// ---------- Events ----------
document.querySelectorAll(".mode-btn").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode))
);
$("translateBtn").addEventListener("click", run);
$("input").addEventListener("input", () => {
  $("counter").textContent = `${$("input").value.length} / ${MAX}`;
});
$("input").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
});
$("swapBtn").addEventListener("click", () => {
  if (!lastTranslation) return;
  $("input").value = lastTranslation;
  $("input").dispatchEvent(new Event("input"));
  setMode("auto");
});
$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastTranslation);
  $("copyBtn").textContent = "Copied ✓";
  setTimeout(() => ($("copyBtn").textContent = "Copy"), 1500);
});

setMode("auto");
