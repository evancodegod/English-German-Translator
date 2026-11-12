/* Left-hand grammar search panel: type-ahead suggestions, definition card, and "show in Deep Dive". */
(function () {
  "use strict";
  const GS = window.GrammarSearch;
  const input = document.getElementById("gsInput");
  if (!GS || !input) return;

  const $ = (id) => document.getElementById(id);
  const list = $("gsList");
  const detail = $("gsDetail");
  const chips = $("gsChips");
  const hint = $("gsHint");

  let analysis = null;
  let index = GS.buildIndex(null);
  let results = [];
  let active = -1;

  function h(tag, cls = "", text = "") {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // Term with the typed part in bold. Matches on the normalised text so "prat" highlights "Prät".
  function boldMatch(term, q) {
    const frag = document.createDocumentFragment();
    const nq = GS.norm(q);
    const nt = GS.norm(term);
    let at = nq ? nt.indexOf(nq) : -1;
    // normalisation can change length (ß -> ss); fall back to no bolding in that case
    if (at < 0 || nt.length !== term.length) { frag.appendChild(document.createTextNode(term)); return frag; }
    frag.appendChild(document.createTextNode(term.slice(0, at)));
    frag.appendChild(h("strong", "text-white", term.slice(at, at + nq.length)));
    frag.appendChild(document.createTextNode(term.slice(at + nq.length)));
    return frag;
  }

  function close() {
    list.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function setActive(i) {
    active = i;
    [...list.children].forEach((li, k) => {
      const on = k === i;
      li.setAttribute("aria-selected", String(on));
      li.classList.toggle("bg-slate-800", on);
    });
    if (i >= 0) input.setAttribute("aria-activedescendant", "gsOpt" + i);
    else input.removeAttribute("aria-activedescendant");
  }

  function renderSuggestions() {
    const q = input.value;
    list.replaceChildren();
    if (!q.trim()) { results = []; close(); return; }
    results = GS.search(index, q);
    if (!results.length) {
      const li = h("li", "px-3 py-2 text-sm text-slate-500", "No match. Try a shorter word.");
      li.setAttribute("role", "presentation");
      list.appendChild(li);
    }
    results.forEach((e, i) => {
      const li = h("li", "px-3 py-2 cursor-pointer flex items-center justify-between gap-2 text-sm text-slate-300");
      li.id = "gsOpt" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const left = h("span", "truncate");
      left.appendChild(boldMatch(e.term, q));
      li.appendChild(left);
      const tag = e.used
        ? h("span", "shrink-0 text-[10px] uppercase tracking-wide text-amber-300", e.source === "sentence" ? "your sentence" : "used here")
        : h("span", "shrink-0 text-[10px] uppercase tracking-wide text-slate-500", e.category);
      li.appendChild(tag);
      // mousedown (not click) so it fires before the input loses focus
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); choose(i); });
      li.addEventListener("mousemove", () => setActive(i));
      list.appendChild(li);
    });
    list.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
    setActive(results.length ? 0 : -1);
  }

  // ---------- Highlighting inside the Deep Dive ----------
  const HL = ["ring-2", "ring-amber-400/70", "bg-amber-500/10"];

  function clearHighlights() {
    document.querySelectorAll("#breakdown .gs-hit").forEach((n) => {
      n.classList.remove("gs-hit", ...HL);
    });
  }

  function termNeedles(e) {
    return [e.term, ...e.aliases].map(GS.norm).filter((t) => t.length >= 3);
  }

  // Marks blocks of the current Deep Dive that mention the term, opens their dropdowns, scrolls to the first.
  function showInDeepDive(e) {
    clearHighlights();
    const root = $("breakdown");
    if (!root || !analysis) return 0;
    const needles = termNeedles(e);
    const blocks = [];
    root.querySelectorAll("details").forEach((det) => {
      [...det.children[det.children.length - 1].children].forEach((b) => blocks.push({ b, det }));
    });
    // always-visible cards (tense / mood / word order) and the summary
    root.querySelectorAll(":scope > p, :scope > div .rounded-xl").forEach((b) => {
      if (!b.closest("details")) blocks.push({ b, det: null });
    });
    const hits = blocks.filter(({ b }) => {
      const t = GS.norm(b.textContent);
      return needles.some((n) => t.includes(n));
    });
    hits.forEach(({ b, det }) => {
      if (det && !det.open) det.open = true;
      b.classList.add("gs-hit", ...HL);
    });
    if (hits.length) hits[0].b.scrollIntoView({ behavior: "smooth", block: "center" });
    return hits.length;
  }

  // ---------- Detail card ----------
  function showDetail(e) {
    detail.replaceChildren();
    const head = h("div", "flex items-start justify-between gap-2");
    head.appendChild(h("h3", "text-lg font-semibold text-amber-200 break-words", e.term));
    head.appendChild(h("span", "shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 text-slate-400", e.category));
    detail.appendChild(head);
    detail.appendChild(h("p", "mt-2 text-sm text-slate-300", e.definition));
    if (e.example) {
      const ex = h("p", "mt-3 text-sm italic text-slate-400 border-l-2 border-slate-700 pl-3", e.example);
      detail.appendChild(ex);
    }
    if (e.aliases.length && e.source === "glossary") {
      detail.appendChild(h("p", "mt-3 text-xs text-slate-500", "Also: " + e.aliases.slice(0, 4).join(", ")));
    }
    if (analysis) {
      const n = showInDeepDive(e);
      detail.appendChild(h("p", "mt-3 text-xs " + (n ? "text-amber-300" : "text-slate-500"),
        n ? `Highlighted ${n} place${n === 1 ? "" : "s"} in the Deep Dive.` : "Not mentioned in the current Deep Dive."));
    }
    detail.classList.remove("hidden");
  }

  function choose(i) {
    const e = results[i];
    if (!e) return;
    input.value = e.term;
    close();
    showDetail(e);
  }

  // ---------- Chips (starter terms / terms used in this sentence) ----------
  function renderChips() {
    chips.replaceChildren();
    const usedTerms = index.filter((e) => e.used && e.source === "glossary").map((e) => e.term);
    const terms = analysis && usedTerms.length ? usedTerms.slice(0, 12) : GS.STARTERS;
    hint.textContent = analysis && usedTerms.length ? "Terms in your Deep Dive" : "Try one of these";
    terms.forEach((t) => {
      const b = h("button", "text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-200 transition", t);
      b.type = "button";
      b.addEventListener("click", () => {
        const e = index.find((x) => x.term === t && x.source === "glossary");
        if (e) { input.value = e.term; close(); showDetail(e); }
      });
      chips.appendChild(b);
    });
  }

  // ---------- Events ----------
  input.addEventListener("input", renderSuggestions);
  input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(); });
  input.addEventListener("blur", () => setTimeout(close, 100));
  input.addEventListener("keydown", (ev) => {
    const open = !list.classList.contains("hidden");
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!open) renderSuggestions();
      else if (results.length) setActive((active + 1) % results.length);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (open && results.length) setActive((active - 1 + results.length) % results.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (open && active >= 0) choose(active);
      else if (!open && input.value.trim()) {
        const r = GS.search(index, input.value, 1);
        if (r[0]) { results = r; choose(0); }
      }
    } else if (ev.key === "Tab" && open && active >= 0 && results[active]) {
      // Tab completes the word, like a shell
      ev.preventDefault();
      input.value = results[active].term;
      renderSuggestions();
    } else if (ev.key === "Escape") {
      if (open) close();
      else { input.value = ""; detail.classList.add("hidden"); clearHighlights(); }
    }
  });
  $("gsClear").addEventListener("click", () => {
    input.value = "";
    detail.classList.add("hidden");
    clearHighlights();
    close();
    input.focus();
  });

  window.GrammarPanel = {
    update(d) {
      analysis = d || null;
      index = GS.buildIndex(analysis);
      detail.classList.add("hidden");
      if (!analysis) clearHighlights();
      renderChips();
      if (document.activeElement === input && input.value.trim()) renderSuggestions();
    },
  };

  renderChips();
})();
