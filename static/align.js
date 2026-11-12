/* Word-link graphic: the original sentence on top, the translation below, and a line between every pair of
   words (or short phrases) the AI is certain are exact equivalents. Words without a certain match get no line.
   Everything is built with DOM / SVG nodes and textContent, never innerHTML. */
(function () {
  "use strict";
  const section = document.getElementById("alignSection");
  if (!section) return;
  const $ = (id) => document.getElementById(id);
  const body = $("alignBody");
  const spinner = $("alignSpinner");
  const SVGNS = "http://www.w3.org/2000/svg";

  const COLORS = {
    noun: "#fbbf24", verb: "#818cf8", pronoun: "#34d399", preposition: "#fb7185", adjective: "#e879f9",
    adverb: "#2dd4bf", number: "#fb923c", conjunction: "#a3e635", other: "#94a3b8",
  };
  const LABELS = {
    noun: "noun", verb: "verb", pronoun: "pronoun", preposition: "preposition", adjective: "adjective",
    adverb: "adverb", number: "number", conjunction: "conjunction", other: "other",
  };

  function h(tag, cls = "", text = "") {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function svg(tag, attrs = {}) {
    const n = document.createElementNS(SVGNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }
  const isWord = (t) => /[\p{L}\p{N}]/u.test(t);

  let redraw = null;
  window.addEventListener("resize", () => { if (redraw) redraw(); });

  function setLoading(on) {
    spinner.classList.toggle("hidden", !on);
  }

  function clear() {
    redraw = null;
    body.replaceChildren();
    section.classList.add("hidden");
    setLoading(false);
  }

  function start() {
    redraw = null;
    body.replaceChildren(h("div", "h-28 rounded-xl bg-slate-800/60 animate-pulse"));
    section.classList.remove("hidden");
    setLoading(true);
  }

  function fail(msg) {
    redraw = null;
    setLoading(false);
    body.replaceChildren(h("p", "text-sm text-slate-400", msg));
  }

  // Turn tokens into chips: a linked group becomes one chip, everything else is a plain word / punctuation chip.
  function buildRow(tokens, links, side) {
    const row = h("div", "flex items-center gap-1.5 w-max min-w-full px-1");
    const starts = new Map();
    links.forEach((l, i) => starts.set(l[side][0], { l, i }));
    const chips = []; // [{ el, linkIndex }]
    let i = 0;
    while (i < tokens.length) {
      const hit = starts.get(i);
      if (hit) {
        const last = hit.l[side][hit.l[side].length - 1];
        const chip = h("span", "chip px-3 py-1.5 rounded-lg border text-base whitespace-nowrap cursor-default transition", tokens.slice(i, last + 1).join(" "));
        const c = COLORS[hit.l.category] || COLORS.other;
        chip.style.borderColor = c;
        chip.style.backgroundColor = c + "26";
        chip.dataset.link = String(hit.i);
        row.appendChild(chip);
        chips.push({ el: chip, link: hit.i });
        i = last + 1;
      } else {
        const t = tokens[i];
        const chip = h("span", isWord(t)
          ? "px-2 py-1.5 text-base text-slate-500 whitespace-nowrap"
          : "py-1.5 -ml-1 text-base text-slate-500 whitespace-nowrap", t);
        row.appendChild(chip);
        i += 1;
      }
    }
    return { row, chips };
  }

  function render(data) {
    setLoading(false);
    const { source_tokens: st, target_tokens: tt, links } = data;
    const meta = window.AlignMeta || { sourceLabel: "Original", targetLabel: "Translation" };

    const frame = h("div", "");
    frame.appendChild(h("div", "text-xs uppercase tracking-wider text-slate-500 mb-2", meta.sourceLabel));

    const scroller = h("div", "overflow-x-auto pb-2");
    const wrap = h("div", "relative w-max min-w-full");
    const top = buildRow(st, links, "source");
    const gap = h("div", "h-24");
    const bottom = buildRow(tt, links, "target");
    const overlay = svg("svg", { class: "absolute inset-0 w-full h-full pointer-events-none", "aria-hidden": "true" });
    wrap.append(top.row, gap, bottom.row, overlay);
    scroller.appendChild(wrap);
    frame.appendChild(scroller);
    frame.appendChild(h("div", "text-xs uppercase tracking-wider text-slate-500 mt-2", meta.targetLabel));

    // legend + summary
    const used = [...new Set(links.map((l) => l.category))];
    const foot = h("div", "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400");
    const wordsTotal = [st, tt].reduce((n, arr) => n + arr.filter(isWord).length, 0);
    const wordsLinked = links.reduce((n, l) => n + l.source.length + l.target.length, 0);
    foot.appendChild(h("span", "", links.length
      ? `${links.length} certain match${links.length === 1 ? "" : "es"} · ${wordsLinked} of ${wordsTotal} words linked`
      : "No word pairs were certain enough to link."));
    used.forEach((cat) => {
      const item = h("span", "inline-flex items-center gap-1.5");
      const dot = h("span", "inline-block w-2.5 h-2.5 rounded-full");
      dot.style.backgroundColor = COLORS[cat];
      item.append(dot, document.createTextNode(LABELS[cat]));
      foot.appendChild(item);
    });
    frame.appendChild(foot);
    frame.appendChild(h("p", "mt-2 text-xs text-slate-500",
      "A line is drawn only when the two words (or phrases) are exact equivalents. Greyed words have no certain one-to-one match, " +
      "for example particles, auxiliaries and words that depend on context."));

    // screen-reader version of the links
    const sr = h("ul", "sr-only");
    links.forEach((l) => {
      sr.appendChild(h("li", "", `${l.source.map((i) => st[i]).join(" ")} corresponds to ${l.target.map((i) => tt[i]).join(" ")} (${l.category})`));
    });
    frame.appendChild(sr);

    body.replaceChildren(frame);

    // ----- lines -----
    const topEl = new Map(top.chips.map((c) => [c.link, c.el]));
    const botEl = new Map(bottom.chips.map((c) => [c.link, c.el]));
    const paths = [];

    function draw() {
      overlay.replaceChildren();
      paths.length = 0;
      const base = wrap.getBoundingClientRect();
      overlay.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
      links.forEach((l, i) => {
        const a = topEl.get(i), b = botEl.get(i);
        if (!a || !b) return;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x1 = ra.left + ra.width / 2 - base.left, y1 = ra.bottom - base.top;
        const x2 = rb.left + rb.width / 2 - base.left, y2 = rb.top - base.top;
        const mid = (y1 + y2) / 2;
        const color = COLORS[l.category] || COLORS.other;
        const g = svg("g", { class: "link", "data-link": String(i), style: "transition: opacity .15s" });
        g.appendChild(svg("path", {
          d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`,
          fill: "none", stroke: color, "stroke-width": "2.5", "stroke-linecap": "round",
        }));
        g.appendChild(svg("circle", { cx: x1, cy: y1, r: 3.5, fill: color }));
        g.appendChild(svg("circle", { cx: x2, cy: y2, r: 3.5, fill: color }));
        overlay.appendChild(g);
        paths.push(g);
      });
    }
    redraw = draw;
    requestAnimationFrame(draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

    // hover / focus: emphasise one match and dim the rest
    function focusLink(idx) {
      paths.forEach((g) => { g.style.opacity = idx == null || g.dataset.link === String(idx) ? "1" : "0.12"; });
      [...top.chips, ...bottom.chips].forEach(({ el, link }) => {
        el.style.opacity = idx == null || link === idx ? "1" : "0.35";
      });
    }
    [...top.chips, ...bottom.chips].forEach(({ el, link }) => {
      el.addEventListener("mouseenter", () => focusLink(link));
      el.addEventListener("mouseleave", () => focusLink(null));
    });
  }

  window.AlignGraphic = { start, render, fail, clear };
})();
