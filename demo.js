/* ============================================================
   CWoMP Project Page – Interactive Demo Logic
   ============================================================ */

(function () {
  "use strict";

  /* ---- State ---- */
  let examples = null;
  let lexicons = null;
  let currentLang = "Tsez";
  let currentIdx = 0;
  let lexOpen = false;

  const METHODS = [
    { key: "ground_truth", label: "Ground Truth" },
    { key: "cwmp_train",    label: "CWoMP (Train Lex)" },
    { key: "cwmp_extended", label: "CWoMP (Ext. Lex)" },
    { key: "glosslm",       label: "GlossLM" },
  ];

  /* ---- MER (Morpheme Error Rate) ---- */
  function mer(pred, gold) {
    if (gold.length === 0) return 0;
    const dp = [];
    for (let i = 0; i <= pred.length; i++) {
      dp[i] = [];
      for (let j = 0; j <= gold.length; j++) {
        if (i === 0) dp[i][j] = j;
        else if (j === 0) dp[i][j] = i;
        else dp[i][j] = 0;
      }
    }
    for (let i = 1; i <= pred.length; i++) {
      for (let j = 1; j <= gold.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (pred[i - 1] === gold[j - 1] ? 0 : 1)
        );
      }
    }
    return Math.min(dp[pred.length][gold.length] / gold.length, 1.0);
  }

  /* ---- Helpers ---- */
  function isPlaceholder(arr) {
    return arr && arr.some(v => typeof v === "string" && v.includes("[PLACEHOLDER]"));
  }

  function chipClass(gloss, gt) {
    if (!gloss) return "chip-placeholder";
    if (gloss.includes("[PLACEHOLDER]")) return "chip-placeholder";
    if (gloss === gt) return "chip-correct";
    return "chip-wrong";
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---- Render current sentence ---- */
  function render() {
    const langExamples = examples[currentLang] || [];
    const ex = langExamples[currentIdx];
    const total = langExamples.length;

    // Update nav
    document.getElementById("sent-index").textContent =
      `Sentence ${currentIdx + 1} of ${total}`;
    document.getElementById("btn-prev").disabled = currentIdx === 0;
    document.getElementById("btn-next").disabled = currentIdx >= total - 1;

    const display = document.getElementById("sentence-display");
    display.innerHTML = "";

    if (!ex) {
      display.textContent = "No examples available for this language yet.";
      return;
    }

    // Transcript
    const t = el("div", "sentence-field");
    t.appendChild(el("div", "field-label", "Transcript"));
    t.appendChild(Object.assign(el("div", "field-text transcript"), { textContent: ex.transcript }));
    display.appendChild(t);

    // Translation
    const tr = el("div", "sentence-field");
    tr.appendChild(el("div", "field-label", "Translation"));
    tr.appendChild(Object.assign(el("div", "field-text translation"), { textContent: ex.translation }));
    display.appendChild(tr);

    // Segmentation
    const seg = el("div", "sentence-field");
    seg.appendChild(el("div", "field-label", "Morpheme segmentation"));
    seg.appendChild(Object.assign(el("div", ""), {
      innerHTML: `<span class="field-text segmentation">${escHtml(ex.segmentation)}</span>`
    }));
    display.appendChild(seg);

    // Placeholder notice if any method has placeholder data
    const anyPlaceholder = METHODS.some(m => m.key !== "ground_truth" && isPlaceholder(ex[m.key]));
    if (anyPlaceholder) {
      const notice = el("div", "placeholder-notice");
      notice.textContent = "Model outputs for this example are placeholder data and will be replaced with real predictions.";
      display.appendChild(notice);
    }

    // Build gloss comparison table
    const gt = ex.ground_truth || [];
    const tableWrap = el("div", "gloss-table-wrap");
    const table = el("table", "gloss-table");

    // Header
    const thead = el("thead");
    const hrow = el("tr");
    hrow.appendChild(el("th", null, "Method"));
    gt.forEach((_, i) => {
      const th = el("th");
      th.textContent = `M${i + 1}`;
      th.style.textAlign = "center";
      hrow.appendChild(th);
    });
    const merTh = el("th", null, "MER");
    merTh.style.textAlign = "right";
    hrow.appendChild(merTh);
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = el("tbody");

    METHODS.forEach(method => {
      const row = el("tr");
      // Method label
      const labelTd = el("td", "method-label", method.label);
      row.appendChild(labelTd);

      const glosses = ex[method.key] || [];
      const isGT = method.key === "ground_truth";
      const phRow = !isGT && isPlaceholder(glosses);

      // Morpheme cells — align to GT length
      for (let i = 0; i < gt.length; i++) {
        const td = el("td");
        td.style.textAlign = "center";
        const gloss = glosses[i];
        const cls = isGT ? "chip-gt" : chipClass(gloss, gt[i]);
        const chip = el("span", `morph-chip ${cls}`, gloss || "");
        td.appendChild(chip);
        row.appendChild(td);
      }

      // MER
      const merTd = el("td", "mer-cell");
      merTd.style.textAlign = "right";
      if (isGT) {
        merTd.innerHTML = `<span class="mer-dash">—</span>`;
      } else if (phRow) {
        merTd.innerHTML = `<span class="mer-dash">—</span>`;
      } else {
        const score = mer(glosses, gt);
        const pct = (score * 100).toFixed(1);
        merTd.textContent = `${pct}%`;
      }
      row.appendChild(merTd);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    display.appendChild(tableWrap);
  }

  /* ---- Render lexicon ---- */
  function renderLexicon() {
    const panel = document.getElementById("lexicon-panel");
    panel.innerHTML = "";

    const entries = (lexicons && lexicons[currentLang]) || [];

    const title = el("h3", null, `${currentLang} Lexicon (top ${entries.length} morphemes by training frequency)`);
    panel.appendChild(title);

    if (entries.length === 0) {
      panel.appendChild(el("p", "lex-note", "Lexicon data not available for this language."));
      return;
    }

    const tableWrap = el("div");
    tableWrap.style.maxHeight = "300px";
    tableWrap.style.overflowY = "auto";

    const table = el("table", "lex-table");
    const thead = el("thead");
    const hrow = el("tr");
    ["Morpheme", "Gloss", "Freq."].forEach(h => hrow.appendChild(el("th", null, h)));
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = el("tbody");
    entries.forEach(e => {
      const row = el("tr");
      row.appendChild(el("td", null, e.morpheme));
      row.appendChild(el("td", null, e.gloss));
      row.appendChild(el("td", null, String(e.frequency)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);

    const note = el("p", "lex-note", "Entries from morpheme_lexicon_train.csv. The extended lexicon includes additional entries from dev/test data.");
    panel.appendChild(note);
  }

  /* ---- Language tab switching ---- */
  function switchLang(lang) {
    currentLang = lang;
    currentIdx = 0;
    document.querySelectorAll(".lang-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
    render();
    if (lexOpen) renderLexicon();
  }

  /* ---- Escape HTML ---- */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- BibTeX copy button ---- */
  function setupCopyBtn() {
    const btn = document.getElementById("copy-bibtex");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const text = document.getElementById("bibtex-text").textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 2000);
      }).catch(() => {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 2000);
      });
    });
  }

  /* ---- Init ---- */
  async function init() {
    try {
      const [exResp, lexResp] = await Promise.all([
        fetch("data/examples.json"),
        fetch("data/lexicon.json"),
      ]);
      examples = await exResp.json();
      lexicons = await lexResp.json();
    } catch (e) {
      console.error("Failed to load demo data:", e);
      const display = document.getElementById("sentence-display");
      if (display) display.textContent = "Error loading demo data. Please ensure you are serving this page via a local server or open it directly in your browser.";
      return;
    }

    // Build language tabs
    const tabContainer = document.getElementById("lang-tabs");
    const langs = Object.keys(examples);
    langs.forEach((lang, i) => {
      const btn = document.createElement("button");
      btn.className = "lang-tab" + (i === 0 ? " active" : "");
      btn.dataset.lang = lang;
      btn.textContent = lang;
      btn.addEventListener("click", () => switchLang(lang));
      tabContainer.appendChild(btn);
    });

    // Nav buttons
    document.getElementById("btn-prev").addEventListener("click", () => {
      if (currentIdx > 0) { currentIdx--; render(); }
    });
    document.getElementById("btn-next").addEventListener("click", () => {
      const total = (examples[currentLang] || []).length;
      if (currentIdx < total - 1) { currentIdx++; render(); }
    });

    // Lexicon toggle
    document.getElementById("lexicon-toggle").addEventListener("click", () => {
      lexOpen = !lexOpen;
      const panel = document.getElementById("lexicon-panel");
      const btn = document.getElementById("lexicon-toggle");
      if (lexOpen) {
        panel.classList.add("open");
        btn.textContent = "▲ Hide Lexicon";
        renderLexicon();
      } else {
        panel.classList.remove("open");
        btn.textContent = "▼ Show Lexicon";
      }
    });

    setupCopyBtn();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
