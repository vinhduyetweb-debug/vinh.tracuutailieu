const APP_VERSION = "4.0.0";
const DB = "pccc_legal_search_v3";
const STORE = "docs";
const CACHE_HINT = "pccc-legal-research-os-cache-v4.0.0";
const KEYS = {
  settings: "pccc_app_settings_v4",
  cases: "pccc_cases_v4",
  checklist: "pccc_checklist_v4",
  pinned: "pccc_pinned_v4",
  history: "pccc_search_history_v4",
  lastQuery: "pccc_last_query_v4"
};

let db;
let docs = [];
let chunks = [];
let filter = "all";
let lastResults = [];
let lastTerms = [];
let currentQuery = "";
let cases = readJson(KEYS.cases, []);
let checklist = readJson(KEYS.checklist, []);
let settings = readJson(KEYS.settings, { schemaVersion: 4, appVersion: APP_VERSION, activeCaseId: null, createdAt: Date.now() });
let pinned = new Set(readJson(KEYS.pinned, readJson("pccc_pinned_v3", [])));

const TAXONOMY = window.PCCC_TAXONOMY || { topics: [], scenarios: [], slogans: {} };
const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const docList = $("docList");
const drawerDocs = $("drawerDocs");
const resultList = $("resultList");
const summaryBox = $("summaryBox");
const queryInput = $("queryInput");
const caseSelect = $("caseSelect");

window.addEventListener("error", (event) => toast("Lỗi app: " + (event.message || "không rõ")));
window.addEventListener("load", () => {
  setTimeout(() => {
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    updateLibStatus();
  }, 600);
});
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveSettings() {
  settings.appVersion = APP_VERSION;
  settings.schemaVersion = 4;
  settings.updatedAt = Date.now();
  writeJson(KEYS.settings, settings);
}

function saveCases() {
  writeJson(KEYS.cases, cases);
  updateStats();
}

function saveChecklist() {
  writeJson(KEYS.checklist, checklist);
  updateStats();
}

function activeCase() {
  return cases.find((item) => item.id === settings.activeCaseId) || null;
}

function updateNetworkStatus() {
  const el = $("networkStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "Online" : "Offline";
  el.className = "statusPill " + (online ? "ok" : "warn");
}

function updateLibStatus() {
  const pdf = !!window.pdfjsLib;
  const docx = !!window.mammoth;
  $("libStatus").textContent = `Thư viện: PDF ${pdf ? "OK" : "cần internet"} • DOCX ${docx ? "OK" : "cần internet"} • TXT OK.`;
}

function updateAppState() {
  const stateEl = $("appState");
  const explainEl = $("stateExplain");
  const conclusionEl = $("mainConclusion");
  const sloganEl = $("mainSlogan");
  let state = "EMPTY";
  let explain = "Chưa có tài liệu để tra cứu.";
  let conclusion = "Upload tài liệu PCCC để bắt đầu tra cứu.";
  let slogan = TAXONOMY.slogans.empty || "Tra cứu nhanh. Đối chiếu chậm.";

  if (!navigator.onLine) {
    state = docs.length ? "OFFLINE_READY" : "OFFLINE";
    explain = docs.length ? "Có thể tra cứu tài liệu đã nạp." : "Offline, chưa có tài liệu cục bộ.";
    conclusion = docs.length ? "Đang offline nhưng thư viện cục bộ vẫn dùng được." : "Cần online để nạp PDF/DOCX lần đầu.";
    slogan = TAXONOMY.slogans.offline || slogan;
  } else if (docs.length && lastResults.length) {
    state = "DONE";
    explain = `Đã có ${lastResults.length} kết quả gần nhất.`;
    conclusion = "Đã tìm thấy căn cứ sơ bộ. Hãy ghim, thêm checklist hoặc mở văn bản gốc.";
    slogan = TAXONOMY.slogans.done || slogan;
  } else if (docs.length) {
    state = "READY";
    explain = `${docs.length} tài liệu, ${chunks.length} đoạn chỉ mục.`;
    conclusion = "Chọn tình huống hoặc nhập câu hỏi để tra cứu.";
    slogan = TAXONOMY.slogans.ready || slogan;
  }

  stateEl.textContent = state;
  stateEl.className = "stateBadge " + state.toLowerCase().replace(/_/g, "-");
  explainEl.textContent = explain;
  conclusionEl.textContent = conclusion;
  sloganEl.textContent = slogan;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function os(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function allDocs() {
  return new Promise((resolve, reject) => {
    const request = os().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putDoc(doc) {
  return new Promise((resolve, reject) => {
    const request = os("readwrite").put(doc);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function delDoc(id) {
  return new Promise((resolve, reject) => {
    const request = os("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearDocs() {
  return new Promise((resolve, reject) => {
    const request = os("readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function fmt(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return size.toFixed(unit ? 1 : 0) + " " + units[unit];
}

function typeOf(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return "file";
}

function icon(type) {
  return type === "pdf" ? "📕" : type === "docx" ? "📘" : type === "txt" ? "📄" : "📎";
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortText(value, max = 180) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + "…";
}

async function parsePdf(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js chưa tải. Hãy bật internet rồi reload trang.");
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(`Trang ${pageNo}\n` + content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error("mammoth.js chưa tải. Hãy bật internet rồi reload trang.");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

async function parseTxt(file) {
  return await file.text();
}

function extractLocation(text, fallbackIndex) {
  const page = (text.match(/Trang\s+(\d+)/i) || [])[1] || "";
  const chapter = (text.match(/\b(Chương\s+[IVXLCDM\d]+[^\n]{0,80})/i) || [])[1] || "";
  const section = (text.match(/\b(Mục\s+\d+[^\n]{0,80})/i) || [])[1] || "";
  const article = (text.match(/\b(Điều\s+\d+[\.:]?[^\n]{0,120})/i) || [])[1] || "";
  const clause = (text.match(/\b(Khoản\s+\d+[\.:]?[^\n]{0,100})/i) || [])[1] || "";
  const point = (text.match(/\b([a-zđ])\)\s+[^\n]{0,100}/i) || [])[1] || "";
  const law = (text.match(/\b(Nghị định|Thông tư|QCVN|TCVN|Luật|Quy chuẩn)[^\n,;]{0,90}/i) || [])[0] || "";
  const parts = [];
  if (law) parts.push(law.trim());
  if (chapter) parts.push(chapter.trim());
  if (section) parts.push(section.trim());
  if (article) parts.push(article.trim());
  if (clause) parts.push(clause.trim());
  if (point) parts.push("Điểm " + point.trim());
  if (page) parts.push("Trang " + page);
  if (!parts.length) parts.push("Đoạn " + (fallbackIndex + 1));
  return { page, chapter, section, article, clause, point, law, label: parts.join(" → ") };
}

function splitChunks(text, docId, fileName, type) {
  const clean = (text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const splitRegex = /\n\s*\n|(?=Trang\s+\d+\b)|(?=Chương\s+[IVXLCDM\d]+\b)|(?=Mục\s+\d+[\.:])|(?=Điều\s+\d+[\.:])|(?=Khoản\s+\d+[\.:])/gi;
  const paragraphs = clean.split(splitRegex).map((item) => item.trim()).filter((item) => item.length > 20);
  const out = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const pieces = [];
    if (paragraph.length > 1600) {
      for (let start = 0; start < paragraph.length; start += 1100) {
        pieces.push(paragraph.slice(start, start + 1400));
      }
    } else {
      pieces.push(paragraph);
    }
    pieces.forEach((piece) => {
      const idx = out.length;
      const location = extractLocation(piece, paragraphIndex);
      out.push({ docId, fileName, type, idx, text: piece, location });
    });
  });
  return out;
}

async function addFiles(files) {
  updateLibStatus();
  const valid = Array.from(files || []).filter((file) => /\.(pdf|docx|txt)$/i.test(file.name));
  if (!valid.length) {
    toast("Chưa chọn file PDF/DOCX/TXT hợp lệ.");
    return;
  }

  for (const file of valid) {
    try {
      toast("Đang đọc: " + file.name);
      const type = typeOf(file.name);
      const text = type === "pdf" ? await parsePdf(file) : type === "docx" ? await parseDocx(file) : await parseTxt(file);
      if (!text.trim()) throw new Error("không trích xuất được nội dung chữ");
      await putDoc({
        id: crypto.randomUUID(),
        name: file.name,
        type,
        size: file.size,
        text,
        createdAt: Date.now(),
        appVersion: APP_VERSION
      });
      toast("Đã lưu: " + file.name);
    } catch (error) {
      toast("Lỗi đọc " + file.name + ": " + error.message);
    }
  }
  fileInput.value = "";
  await refresh();
}

async function refresh() {
  docs = (await allDocs()).sort((a, b) => b.createdAt - a.createdAt);
  chunks = [];
  docs.forEach((doc) => chunks.push(...splitChunks(doc.text, doc.id, doc.name, doc.type)));
  renderDocs();
  renderCases();
  renderChecklist();
  updateStats();
  updateAppState();
}

function updateStats() {
  $("docCount").textContent = docs.length;
  $("chunkCount").textContent = chunks.length;
  $("caseCount").textContent = cases.length;
  $("checkCount").textContent = checklist.length;
}

function renderDocs() {
  const html = docs.length
    ? docs.map((doc) => `
      <div class="docItem" data-id="${doc.id}">
        <h4>${icon(doc.type)} ${esc(doc.name)}</h4>
        <p>${doc.type.toUpperCase()} • ${fmt(doc.size)} • ${new Date(doc.createdAt).toLocaleDateString("vi-VN")}</p>
        <div class="docActions">
          <button class="mini docSearch" type="button">Tìm</button>
          <button class="mini docCopy" type="button">Copy tên</button>
          <button class="mini docRemove" type="button">Xóa</button>
        </div>
      </div>`).join("")
    : "<div class='summaryBox'>Chưa có tài liệu. Hãy upload PDF/DOCX/TXT.</div>";
  docList.innerHTML = html;
  drawerDocs.innerHTML = html;
  document.querySelectorAll(".docItem").forEach((el) => {
    const id = el.dataset.id;
    const searchBtn = el.querySelector(".docSearch");
    const copyBtn = el.querySelector(".docCopy");
    const removeBtn = el.querySelector(".docRemove");
    if (searchBtn) searchBtn.onclick = () => searchDoc(id);
    if (copyBtn) copyBtn.onclick = () => {
      const doc = docs.find((item) => item.id === id);
      if (doc) navigator.clipboard.writeText(doc.name);
      toast("Đã copy tên tài liệu.");
    };
    if (removeBtn) removeBtn.onclick = () => removeDoc(id);
  });
}

async function removeDoc(id) {
  if (!confirm("Xóa tài liệu này khỏi thư viện?")) return;
  await delDoc(id);
  await refresh();
  toast("Đã xóa tài liệu.");
}

function searchDoc(id) {
  const doc = docs.find((item) => item.id === id);
  if (!doc) return;
  filter = doc.type;
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === doc.type));
  queryInput.value = doc.name.replace(/\.(pdf|docx|txt)$/i, "").split(/[-_]/)[0];
  search();
}

function getQueryTerms(query) {
  const normalizedQuery = normalizeText(query);
  const rawTokens = normalizedQuery
    .split(/[\s,;:"'“”‘’()[\]{}.!?\/\\\-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);

  const terms = new Map();
  const add = (value, weight = 1, phrase = false) => {
    const raw = String(value || "").trim();
    const norm = normalizeText(raw);
    if (norm.length < 2) return;
    terms.set(norm, { raw, norm, weight, phrase: phrase || norm.includes(" ") });
  };

  rawTokens.forEach((token) => add(token, 1, false));
  if (normalizedQuery.includes(" ")) add(query, 3, true);

  TAXONOMY.topics.forEach((topic) => {
    const topicText = normalizeText([topic.label, ...(topic.terms || [])].join(" "));
    const queryHitsTopic = rawTokens.some((token) => topicText.includes(token)) || (topic.terms || []).some((term) => normalizedQuery.includes(normalizeText(term)));
    if (queryHitsTopic) {
      (topic.terms || []).forEach((term) => add(term, 2, true));
      add(topic.label, 2, true);
    }
  });

  return Array.from(terms.values()).slice(0, 80);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count += 1;
    pos = haystack.indexOf(needle, pos + Math.max(needle.length, 1));
  }
  return count;
}

function scoreChunk(text, terms) {
  const normalizedText = normalizeText(text);
  const hitTerms = new Set();
  let score = 0;
  let phraseHits = 0;

  terms.forEach((term) => {
    const hits = countOccurrences(normalizedText, term.norm);
    if (hits > 0) {
      hitTerms.add(term.norm);
      const phraseBonus = term.phrase ? 10 : 0;
      if (term.phrase) phraseHits += hits;
      score += hits * (term.weight * 4 + phraseBonus + Math.min(term.norm.length, 18) / 3);
    }
  });

  const tokenHits = hitTerms.size;
  if (terms.length >= 2 && tokenHits < 2 && phraseHits === 0) return { score: 0, tokenHits, phraseHits };
  score += tokenHits * 6 + phraseHits * 12;
  return { score: Math.round(score), tokenHits, phraseHits };
}

function inferTopic(text, query = "") {
  const normalized = normalizeText(text + " " + query);
  const scored = TAXONOMY.topics.map((topic) => {
    const topicTerms = [topic.label, ...(topic.terms || [])];
    const score = topicTerms.reduce((sum, term) => sum + (normalized.includes(normalizeText(term)) ? 1 : 0), 0);
    return { ...topic, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score ? scored[0] : { key: "khac", label: "Cần phân loại", group: "Khác", action: "Đọc đoạn gốc và phân loại thủ công trước khi kết luận.", score: 0 };
}

function relevanceOf(result) {
  if (result.score >= 70 || result.phraseHits >= 2) return "Cao";
  if (result.score >= 30 || result.tokenHits >= 3) return "Trung bình";
  return "Thấp";
}

function resultId(result) {
  return result.docId + "_" + result.idx;
}

function search() {
  const query = queryInput.value.trim();
  if (!query) {
    toast("Nhập từ khóa hoặc chọn tình huống để tra cứu.");
    return;
  }
  currentQuery = query;
  const terms = getQueryTerms(query);
  lastTerms = terms;
  const source = chunks.filter((chunk) => filter === "all" || chunk.type === filter);
  const results = source
    .map((chunk) => {
      const scoreInfo = scoreChunk(chunk.text, terms);
      const topic = inferTopic(chunk.text, query);
      return { ...chunk, ...scoreInfo, topic, query, relevance: "" };
    })
    .filter((item) => item.score > 0)
    .map((item) => ({ ...item, relevance: relevanceOf(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);

  lastResults = results;
  addHistory(query, results.length);
  renderResults(results, query, terms);
  localStorage.setItem(KEYS.lastQuery, query);
  updateAppState();
}

function addHistory(query, count) {
  const history = readJson(KEYS.history, []);
  history.unshift({ query, count, at: Date.now() });
  writeJson(KEYS.history, history.slice(0, 60));
}

function renderResults(results, query, terms) {
  $("resultTitle").textContent = `Kết quả: ${results.length}`;
  if (!results.length) {
    summaryBox.innerHTML = `
      <b>Không tìm thấy căn cứ rõ.</b><br>
      App đã tìm không dấu và mở rộng từ đồng nghĩa cho “${esc(query)}”. Hãy thử câu hỏi rộng hơn hoặc upload thêm văn bản gốc.
    `;
    resultList.innerHTML = "";
    return;
  }

  const files = [...new Set(results.map((item) => item.fileName))];
  const high = results.filter((item) => item.relevance === "Cao").length;
  const topics = [...new Set(results.map((item) => item.topic.label))].slice(0, 5);
  summaryBox.innerHTML = `
    <b>${results.length}</b> đoạn liên quan trong <b>${files.length}</b> tài liệu. 
    Mức liên quan cao: <b>${high}</b>. Chủ đề nổi bật: <b>${esc(topics.join(" • "))}</b>.<br>
    <span class="warningText">Kết luận an toàn: đây là căn cứ sơ bộ, cần mở đoạn gốc và đối chiếu hiệu lực văn bản.</span>
  `;

  resultList.innerHTML = results.map((result, index) => {
    const id = resultId(result);
    const location = result.location?.label || `Đoạn ${result.idx + 1}`;
    const pinnedClass = pinned.has(id) ? "active" : "";
    return `
      <article class="result ${result.relevance === "Cao" ? "strong" : ""}">
        <div class="resultTop">
          <h4>${icon(result.type)} ${esc(result.fileName)}</h4>
          <span class="relevance ${result.relevance === "Cao" ? "high" : result.relevance === "Trung bình" ? "mid" : "low"}">${result.relevance}</span>
        </div>
        <div class="meta">${result.type.toUpperCase()} • ${esc(location)} • điểm ${result.score}</div>
        <div class="insightGrid">
          <div><b>Chủ đề</b><span>${esc(result.topic.label)} · ${esc(result.topic.group || "")}</span></div>
          <div><b>Tóm tắt nhanh</b><span>${esc(makeMiniSummary(result.text, terms))}</span></div>
          <div><b>Hành động gợi ý</b><span>${esc(result.topic.action || "Mở đoạn gốc, đọc đủ ngữ cảnh rồi mới kết luận.")}</span></div>
        </div>
        <div class="snippet">${highlight(snippet(result.text, terms), terms)}</div>
        <div class="resultActions">
          <button class="copyBtn" data-i="${index}" type="button">Copy đoạn</button>
          <button class="pinBtn ${pinnedClass}" data-rid="${id}" type="button">📌 ${pinned.has(id) ? "Đã ghim" : "Ghim"}</button>
          <button class="caseBtn" data-i="${index}" type="button">+ Hồ sơ</button>
          <button class="checkBtn" data-i="${index}" type="button">+ Checklist</button>
          <button class="openBtnResult" data-i="${index}" type="button">📂 Mở gốc</button>
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".copyBtn").forEach((button) => button.onclick = () => copyResult(Number(button.dataset.i)));
  document.querySelectorAll(".pinBtn").forEach((button) => button.onclick = () => togglePin(button.dataset.rid));
  document.querySelectorAll(".caseBtn").forEach((button) => button.onclick = () => addResultToCase(Number(button.dataset.i)));
  document.querySelectorAll(".checkBtn").forEach((button) => button.onclick = () => addResultToChecklist(Number(button.dataset.i)));
  document.querySelectorAll(".openBtnResult").forEach((button) => button.onclick = () => openFileAtResult(Number(button.dataset.i)));
}

function makeMiniSummary(text, terms) {
  const sample = snippet(text, terms).replace(/\s+/g, " ").trim();
  const firstSentence = sample.split(/(?<=[\.\?!;:])\s+/)[0] || sample;
  return shortText(firstSentence.replace(/^\.\.\.\s*/, ""), 220);
}

function snippet(text, terms) {
  const normalized = normalizeText(text);
  let pos = 0;
  for (const term of terms) {
    const index = normalized.indexOf(term.norm);
    if (index >= 0) {
      pos = index;
      break;
    }
  }
  const start = Math.max(0, pos - 220);
  const end = Math.min(text.length, pos + 620);
  return (start > 0 ? "... " : "") + text.slice(start, end) + (end < text.length ? " ..." : "");
}

function highlight(text, terms) {
  let out = esc(text);
  const highlightTerms = [...new Set(terms.map((term) => term.raw).filter((term) => term && term.length > 1))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 20);
  highlightTerms.forEach((term) => {
    const escaped = escapeReg(esc(term));
    try {
      out = out.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
    } catch (_) {
      // Ignore invalid highlight expressions. Search scoring is already accent-insensitive.
    }
  });
  return out;
}

function copyResult(index) {
  const result = lastResults[index];
  if (!result) return;
  const text = `${result.fileName}\n${result.location?.label || "Đoạn " + (result.idx + 1)}\nChủ đề: ${result.topic.label}\n\n${result.text}`;
  navigator.clipboard.writeText(text);
  toast("Đã copy đoạn trích.");
}

function togglePin(id) {
  if (pinned.has(id)) pinned.delete(id);
  else pinned.add(id);
  writeJson(KEYS.pinned, [...pinned]);
  if (currentQuery) renderResults(lastResults, currentQuery, lastTerms);
  renderCases();
}

function showPinned() {
  const terms = currentQuery ? getQueryTerms(currentQuery) : [];
  const results = chunks
    .filter((chunk) => pinned.has(resultId(chunk)))
    .map((chunk) => {
      const topic = inferTopic(chunk.text, currentQuery);
      return { ...chunk, score: 0, tokenHits: 0, phraseHits: 0, topic, query: currentQuery, relevance: "Đã ghim" };
    });
  lastResults = results;
  lastTerms = terms;
  $("resultTitle").textContent = "Kết quả đã ghim";
  summaryBox.innerHTML = `Có <b>${results.length}</b> đoạn đã ghim. Có thể thêm vào hồ sơ hoặc checklist.`;
  renderResults(results, currentQuery || "đã ghim", terms);
  updateAppState();
}

function openFileAtResult(index) {
  const result = lastResults[index];
  if (!result) {
    toast("Không tìm thấy kết quả.");
    return;
  }
  const doc = docs.find((item) => item.id === result.docId);
  if (!doc) {
    toast("Không tìm thấy file trong thư viện.");
    return;
  }
  const terms = lastTerms.length ? lastTerms : getQueryTerms(queryInput.value);
  const all = splitChunks(doc.text, doc.id, doc.name, doc.type);
  let target = all.findIndex((chunk) => chunk.idx === result.idx && chunk.text === result.text);
  if (target < 0) target = Math.max(0, all.findIndex((chunk) => chunk.idx === result.idx));
  const before = all.slice(Math.max(0, target - 2), target).map((chunk) => chunk.text).join("\n\n---\n\n");
  const current = all[target]?.text || result.text;
  const after = all.slice(target + 1, target + 3).map((chunk) => chunk.text).join("\n\n---\n\n");
  $("viewerTitle").textContent = `${icon(doc.type)} ${doc.name}`;
  $("viewerMeta").textContent = `${doc.type.toUpperCase()} • ${result.location?.label || "đoạn " + (result.idx + 1)} • mở để đối chiếu văn bản gốc`;
  $("viewerContent").innerHTML = `<div class="viewerJump"><b>Cụm tìm kiếm:</b> ${esc(queryInput.value || result.query || "")}<br><b>Chủ đề:</b> ${esc(result.topic?.label || "")}</div>${before ? esc(before) + "\n\n---\n\n" : ""}${highlight(current, terms)}${after ? "\n\n---\n\n" + esc(after) : ""}`;
  $("viewer").classList.add("open");
  $("viewer").setAttribute("aria-hidden", "false");
  setTimeout(() => {
    const mark = $("viewerContent").querySelector("mark");
    if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 120);
}

function exportResults() {
  if (!lastResults.length) {
    toast("Chưa có kết quả để export.");
    return;
  }
  const text = [
    "PCCC LEGAL RESEARCH OS V4 - KẾT QUẢ TRA CỨU",
    "Ngày xuất: " + new Date().toLocaleString("vi-VN"),
    "Câu hỏi: " + (currentQuery || queryInput.value || ""),
    "Lưu ý: Kết quả chỉ hỗ trợ tra cứu nội bộ, cần đối chiếu văn bản gốc.",
    "",
    ...lastResults.map((result, index) => `${index + 1}. ${result.fileName}\nVị trí: ${result.location?.label || "Đoạn " + (result.idx + 1)}\nChủ đề: ${result.topic.label}\nMức liên quan: ${result.relevance}\n\n${result.text}\n`)
  ].join("\n---\n");
  downloadText("ket-qua-tra-cuu-pccc-v4.txt", text, "text/plain;charset=utf-8");
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function renderTaxonomy() {
  const scenarioList = $("scenarioList");
  scenarioList.innerHTML = TAXONOMY.scenarios.map((scenario) => `<button type="button" data-query="${esc(scenario.query)}">${esc(scenario.label)}</button>`).join("");
  scenarioList.querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      queryInput.value = button.dataset.query;
      search();
    };
  });

  const topicList = $("topicList");
  topicList.innerHTML = TAXONOMY.topics.map((topic) => `<button type="button" data-query="${esc([topic.label, ...(topic.terms || [])].join(" "))}">${esc(topic.group)} · ${esc(topic.label)}</button>`).join("");
  topicList.querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      queryInput.value = button.dataset.query;
      search();
    };
  });
}

function createCase() {
  const name = $("caseNameInput").value.trim();
  if (!name) {
    toast("Nhập tên hồ sơ trước.");
    return;
  }
  const now = Date.now();
  const item = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, evidence: [], note: "" };
  cases.unshift(item);
  settings.activeCaseId = item.id;
  saveCases();
  saveSettings();
  $("caseNameInput").value = "";
  renderCases();
  updateAppState();
  toast("Đã tạo hồ sơ.");
}

function renderCases() {
  caseSelect.innerHTML = cases.length
    ? cases.map((item) => `<option value="${item.id}" ${item.id === settings.activeCaseId ? "selected" : ""}>${esc(item.name)}</option>`).join("")
    : `<option value="">Chưa có hồ sơ</option>`;

  const active = activeCase();
  const box = $("activeCaseBox");
  if (!active) {
    box.innerHTML = "Chưa có hồ sơ đang mở. Tạo hồ sơ để gom căn cứ và checklist.";
    return;
  }
  const caseChecklist = checklist.filter((item) => item.caseId === active.id);
  box.innerHTML = `
    <b>${esc(active.name)}</b><br>
    Căn cứ đã gom: <b>${active.evidence?.length || 0}</b> • Checklist: <b>${caseChecklist.length}</b> • Cập nhật: ${new Date(active.updatedAt || active.createdAt).toLocaleString("vi-VN")}<br>
    <span class="mutedInline">Mục tiêu: gom đủ đoạn gốc, không kết luận bằng trí nhớ.</span>
  `;
}

function addResultToCase(index) {
  const result = lastResults[index];
  const active = activeCase();
  if (!result) return;
  if (!active) {
    toast("Tạo hồ sơ trước rồi thêm căn cứ.");
    return;
  }
  active.evidence = active.evidence || [];
  const key = resultId(result);
  if (active.evidence.some((item) => item.key === key)) {
    toast("Căn cứ này đã có trong hồ sơ.");
    return;
  }
  active.evidence.unshift({
    id: crypto.randomUUID(),
    key,
    fileName: result.fileName,
    location: result.location?.label || "Đoạn " + (result.idx + 1),
    topic: result.topic.label,
    relevance: result.relevance,
    text: result.text,
    addedAt: Date.now()
  });
  active.updatedAt = Date.now();
  saveCases();
  renderCases();
  toast("Đã thêm căn cứ vào hồ sơ.");
}

function addResultToChecklist(index) {
  const result = lastResults[index];
  if (!result) return;
  const active = activeCase();
  const title = prompt("Tên việc cần kiểm tra:", result.topic.action || result.topic.label || "Đọc và đối chiếu đoạn gốc");
  if (!title) return;
  checklist.unshift({
    id: crypto.randomUUID(),
    caseId: active ? active.id : null,
    title: title.trim(),
    status: "Chưa kiểm",
    note: "",
    topic: result.topic.label,
    sourceFile: result.fileName,
    sourceLocation: result.location?.label || "Đoạn " + (result.idx + 1),
    sourceText: result.text,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  saveChecklist();
  renderChecklist();
  renderCases();
  toast("Đã thêm vào checklist.");
}

function renderChecklist() {
  const list = $("checklistList");
  const active = activeCase();
  const items = active ? checklist.filter((item) => item.caseId === active.id || item.caseId === null) : checklist;
  if (!items.length) {
    list.innerHTML = `<div class="summaryBox smallSummary">Chưa có checklist. Bấm “+ Checklist” trong kết quả tra cứu.</div>`;
    return;
  }
  list.innerHTML = items.map((item) => `
    <article class="checkItem" data-id="${item.id}">
      <div class="checkTop">
        <b>${esc(item.title)}</b>
        <select class="statusSelect">
          ${["Chưa kiểm", "Đạt", "Chưa đạt", "Cần hỏi chuyên gia"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <p>${esc(item.topic)} • ${esc(item.sourceFile)} • ${esc(item.sourceLocation)}</p>
      <textarea class="noteInput" placeholder="Ghi chú kiểm tra...">${esc(item.note || "")}</textarea>
      <div class="docActions"><button class="mini removeCheck" type="button">Xóa</button></div>
    </article>
  `).join("");

  list.querySelectorAll(".checkItem").forEach((el) => {
    const id = el.dataset.id;
    const item = checklist.find((entry) => entry.id === id);
    const select = el.querySelector(".statusSelect");
    const note = el.querySelector(".noteInput");
    const remove = el.querySelector(".removeCheck");
    select.onchange = () => {
      item.status = select.value;
      item.updatedAt = Date.now();
      saveChecklist();
      toast("Đã cập nhật trạng thái.");
    };
    note.onchange = () => {
      item.note = note.value;
      item.updatedAt = Date.now();
      saveChecklist();
      toast("Đã lưu ghi chú.");
    };
    remove.onclick = () => {
      checklist = checklist.filter((entry) => entry.id !== id);
      saveChecklist();
      renderChecklist();
      renderCases();
      toast("Đã xóa checklist.");
    };
  });
}

function clearChecklist() {
  const active = activeCase();
  const label = active ? `checklist của hồ sơ “${active.name}”` : "toàn bộ checklist";
  if (!confirm("Xóa " + label + "?")) return;
  checklist = active ? checklist.filter((item) => item.caseId !== active.id) : [];
  saveChecklist();
  renderChecklist();
  renderCases();
  toast("Đã dọn checklist.");
}

function exportCase() {
  const active = activeCase();
  if (!active) {
    toast("Chưa có hồ sơ để xuất.");
    return;
  }
  const caseChecklist = checklist.filter((item) => item.caseId === active.id || item.caseId === null);
  const lines = [
    "PCCC LEGAL RESEARCH OS V4 - HỒ SƠ TRA CỨU NỘI BỘ",
    "Tên hồ sơ: " + active.name,
    "Ngày xuất: " + new Date().toLocaleString("vi-VN"),
    "Lưu ý: Hồ sơ này chỉ là bản tra cứu nội bộ, cần đối chiếu văn bản gốc và hiệu lực văn bản.",
    "",
    "I. CĂN CỨ ĐÃ GOM",
    ...(active.evidence || []).map((item, index) => `${index + 1}. ${item.fileName}\nVị trí: ${item.location}\nChủ đề: ${item.topic}\nMức liên quan: ${item.relevance}\n${item.text}\n`),
    "",
    "II. CHECKLIST",
    ...caseChecklist.map((item, index) => `${index + 1}. [${item.status}] ${item.title}\nNguồn: ${item.sourceFile} - ${item.sourceLocation}\nGhi chú: ${item.note || ""}\n`),
    "",
    "III. KẾT LUẬN AN TOÀN",
    "Tra cứu nhanh. Đối chiếu chậm. Kết luận phải có căn cứ."
  ];
  downloadText(safeFileName(active.name) + "-ho-so-pccc-v4.txt", lines.join("\n"));
}

function safeFileName(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "ho-so";
}

async function exportBackup() {
  const backup = {
    app: "PCCC Legal Research OS",
    version: APP_VERSION,
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    cacheHint: CACHE_HINT,
    docs,
    cases,
    checklist,
    pinned: [...pinned],
    settings,
    history: readJson(KEYS.history, [])
  };
  downloadText("pccc-legal-research-os-v4-backup.json", JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
  toast("Đã xuất JSON backup.");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!backup || !Array.isArray(backup.docs)) throw new Error("File JSON không đúng định dạng backup V4.");
    if (!confirm("Import sẽ gộp tài liệu/case/checklist từ file JSON vào trình duyệt hiện tại. Tiếp tục?")) return;

    for (const doc of backup.docs) {
      if (doc && doc.id && doc.text && doc.name) await putDoc(doc);
    }
    if (Array.isArray(backup.cases)) {
      const merged = new Map(cases.map((item) => [item.id, item]));
      backup.cases.forEach((item) => { if (item?.id) merged.set(item.id, item); });
      cases = Array.from(merged.values());
      saveCases();
    }
    if (Array.isArray(backup.checklist)) {
      const merged = new Map(checklist.map((item) => [item.id, item]));
      backup.checklist.forEach((item) => { if (item?.id) merged.set(item.id, item); });
      checklist = Array.from(merged.values());
      saveChecklist();
    }
    if (Array.isArray(backup.pinned)) {
      backup.pinned.forEach((id) => pinned.add(id));
      writeJson(KEYS.pinned, [...pinned]);
    }
    if (backup.settings?.activeCaseId) {
      settings.activeCaseId = backup.settings.activeCaseId;
      saveSettings();
    }
    await refresh();
    toast("Đã import backup.");
  } catch (error) {
    toast("Lỗi import: " + error.message);
  } finally {
    $("importBackupInput").value = "";
  }
}

async function resetAll() {
  if (!confirm("Reset dữ liệu V4 gồm hồ sơ, checklist, ghim, lịch sử và tài liệu IndexedDB?")) return;
  if (!confirm("Xác nhận lần 2: thao tác này không thể hoàn tác nếu chưa export backup.")) return;
  await clearDocs();
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  cases = [];
  checklist = [];
  settings = { schemaVersion: 4, appVersion: APP_VERSION, activeCaseId: null, createdAt: Date.now() };
  pinned = new Set();
  saveSettings();
  await refresh();
  toast("Đã reset dữ liệu V4.");
}

function bindEvents() {
  $("pickFileBtn").onclick = () => fileInput.click();
  $("pickFileBtn2").onclick = () => fileInput.click();
  $("focusUploadBtn").onclick = () => fileInput.click();
  $("focusSearchBtn").onclick = () => queryInput.focus();
  fileInput.onchange = (event) => addFiles(event.target.files);

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag");
    addFiles(event.dataTransfer.files);
  });

  $("searchBtn").onclick = search;
  queryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") search();
  });

  document.querySelectorAll(".chip[data-filter]").forEach((button) => {
    button.onclick = () => {
      filter = button.dataset.filter;
      document.querySelectorAll(".chip[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (queryInput.value.trim()) search();
    };
  });

  $("exportBtn").onclick = exportResults;
  $("clearSearchBtn").onclick = () => {
    queryInput.value = "";
    currentQuery = "";
    resultList.innerHTML = "";
    summaryBox.textContent = "Đã xóa kết quả tìm kiếm.";
    lastResults = [];
    updateAppState();
  };
  $("pinnedBtn").onclick = showPinned;

  $("clearAllBtn").onclick = async () => {
    if (!confirm("Xóa toàn bộ thư viện tài liệu? Hồ sơ/checklist vẫn giữ nhưng có thể mất nguồn đối chiếu.")) return;
    await clearDocs();
    await refresh();
    toast("Đã xóa thư viện tài liệu.");
  };

  $("createCaseBtn").onclick = createCase;
  $("caseNameInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") createCase();
  });
  caseSelect.onchange = () => {
    settings.activeCaseId = caseSelect.value || null;
    saveSettings();
    renderCases();
    renderChecklist();
  };
  $("exportCaseBtn").onclick = exportCase;
  $("exportBackupBtn").onclick = exportBackup;
  $("importBackupBtn").onclick = () => $("importBackupInput").click();
  $("importBackupInput").onchange = (event) => importBackup(event.target.files[0]);
  $("resetAllBtn").onclick = resetAll;
  $("clearChecklistBtn").onclick = clearChecklist;
  $("toggleCaseTools").onclick = () => {
    const details = $("caseTools");
    details.open = !details.open;
  };

  $("libraryBtn").onclick = () => {
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
  };
  $("closeDrawerBtn").onclick = () => closeDrawer();
  $("drawer").onclick = (event) => {
    if (event.target.id === "drawer") closeDrawer();
  };

  $("closeViewerBtn").onclick = () => closeViewer();
  $("viewer").onclick = (event) => {
    if (event.target.id === "viewer") closeViewer();
  };
}

function closeDrawer() {
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
}

function closeViewer() {
  $("viewer").classList.remove("open");
  $("viewer").setAttribute("aria-hidden", "true");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

async function boot() {
  updateNetworkStatus();
  renderTaxonomy();
  bindEvents();
  saveSettings();
  await registerServiceWorker();
  db = await openDB();
  await refresh();
  const last = localStorage.getItem(KEYS.lastQuery) || localStorage.getItem("pccc_last_query_v3");
  if (last) queryInput.value = last;
  updateLibStatus();
}

boot().catch((error) => toast("Không khởi động được app: " + error.message));
