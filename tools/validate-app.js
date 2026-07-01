const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "index.html",
  "style.css",
  "app.js",
  "taxonomy.js",
  "manifest.json",
  "service-worker.js",
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "icon.svg",
  "vercel.json"
];
const requiredKeys = [
  "pccc_app_settings_v4",
  "pccc_cases_v4",
  "pccc_checklist_v4",
  "pccc_pinned_v4",
  "pccc_search_history_v4",
  "pccc_last_query_v4"
];
const banned = [".env", ".env.local", ".vercel", "node_modules"];
const placeholders = ["[TÊN APP]", "[TEN_APP]", "[MÔ TẢ", "TODO_BUILD", "PLACEHOLDER"];

function fail(message) {
  console.error("FAIL:", message);
  process.exitCode = 1;
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`Missing required file: ${file}`);
}

for (const item of banned) {
  if (fs.existsSync(path.join(root, item))) fail(`Release contains banned item: ${item}`);
}

let manifest = {};
try {
  manifest = JSON.parse(read("manifest.json"));
} catch (error) {
  fail("manifest.json is invalid JSON");
}

if (!String(manifest.name || "").includes("V4")) fail("manifest name must include V4");
if (manifest.display !== "standalone") fail("manifest display must be standalone");
if (!Array.isArray(manifest.icons) || !manifest.icons.length) fail("manifest must include icons");

const html = read("index.html");
const app = read("app.js");
const sw = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));
const allText = requiredFiles.filter((file) => file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".md") || file.endsWith(".json")).map(read).join("\n");

if (!html.includes('id="appRoot"')) fail("index.html must have appRoot container");
if (!html.includes("service-worker.js") && !app.includes("serviceWorker")) fail("service worker registration not found");
if (!sw.includes("pccc-legal-research-os-cache-v4.0.0")) fail("service worker cache version mismatch");
if (!sw.includes("taxonomy.js")) fail("service worker must cache taxonomy.js");
if (!app.includes('DB = "pccc_legal_search_v3"')) fail("App must preserve V3 IndexedDB name");

for (const key of requiredKeys) {
  if (!app.includes(key)) fail(`Missing localStorage key in app.js: ${key}`);
}

if (!pkg.scripts || !pkg.scripts.check || !pkg.scripts.validate) fail("package.json must include check and validate scripts");

for (const placeholder of placeholders) {
  if (allText.includes(placeholder)) fail(`Placeholder remains: ${placeholder}`);
}

if (!process.exitCode) {
  console.log("PASS: PCCC Legal Research OS V4 package validated.");
}
