const DB="pccc_legal_search_v1",STORE="docs";
const fileInput=document.getElementById("fileInput"),dropZone=document.getElementById("dropZone"),docList=document.getElementById("docList"),drawerDocs=document.getElementById("drawerDocs"),resultList=document.getElementById("resultList"),summaryBox=document.getElementById("summaryBox"),queryInput=document.getElementById("queryInput");
let db,docs=[],chunks=[],filter="all",lastResults=[],pinned=new Set(JSON.parse(localStorage.getItem("pccc_pinned")||"[]"));

if(window.pdfjsLib){pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function os(m="readonly"){return db.transaction(STORE,m).objectStore(STORE)}
function allDocs(){return new Promise((res,rej)=>{const r=os().getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function putDoc(d){return new Promise((res,rej)=>{const r=os("readwrite").put(d);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function delDoc(id){return new Promise((res,rej)=>{const r=os("readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearDocs(){return new Promise((res,rej)=>{const r=os("readwrite").clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

function toast(msg){const e=document.createElement("div");e.className="toast";e.textContent=msg;document.body.appendChild(e);setTimeout(()=>e.remove(),2400)}
function fmt(n){if(!n)return"0 B";const u=["B","KB","MB","GB"];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return n.toFixed(i?1:0)+" "+u[i]}
function typeOf(name){const n=name.toLowerCase();if(n.endsWith(".pdf"))return"pdf";if(n.endsWith(".docx"))return"docx";if(n.endsWith(".txt"))return"txt";return"file"}

function splitChunks(text, docId, fileName, type){
  const clean=(text||"").replace(/\r/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
  const paras=clean.split(/\n\s*\n|(?=Điều\s+\d+[\.:])|(?=Khoản\s+\d+[\.:])/gi).map(x=>x.trim()).filter(x=>x.length>20);
  const out=[];
  paras.forEach((p,i)=>{
    if(p.length>1400){
      for(let j=0;j<p.length;j+=1000) out.push({docId,fileName,type,idx:i,text:p.slice(j,j+1200)});
    }else out.push({docId,fileName,type,idx:i,text:p});
  });
  return out;
}

async function parsePdf(file){
  if(!window.pdfjsLib) throw new Error("Thiếu thư viện pdf.js. Cần internet lần đầu để tải thư viện.");
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  let pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const text=content.items.map(i=>i.str).join(" ");
    pages.push(`Trang ${p}\\n${text}`);
  }
  return pages.join("\\n\\n");
}

async function parseDocx(file){
  if(!window.mammoth) throw new Error("Thiếu thư viện mammoth.js. Cần internet lần đầu để tải thư viện.");
  const arrayBuffer=await file.arrayBuffer();
  const result=await mammoth.extractRawText({arrayBuffer});
  return result.value || "";
}

async function parseTxt(file){return await file.text();}

async function addFiles(files){
  const arr=Array.from(files||[]).filter(f=>/\\.pdf$|\\.docx$|\\.txt$/i.test(f.name));
  if(!arr.length){toast("Chưa có file PDF/DOCX/TXT hợp lệ.");return}
  for(const file of arr){
    try{
      toast("Đang đọc: "+file.name);
      const type=typeOf(file.name);
      let text="";
      if(type==="pdf") text=await parsePdf(file);
      else if(type==="docx") text=await parseDocx(file);
      else text=await parseTxt(file);
      const id=crypto.randomUUID();
      const doc={id,name:file.name,type,size:file.size,text,createdAt:Date.now()};
      await putDoc(doc);
    }catch(e){toast("Lỗi đọc "+file.name+": "+e.message)}
  }
  await refresh();
  toast("Đã cập nhật thư viện tài liệu.");
}

async function refresh(){
  docs=(await allDocs()).sort((a,b)=>b.createdAt-a.createdAt);
  rebuildIndex();
  renderDocs();
  updateStats();
}

function rebuildIndex(){
  chunks=[];
  docs.forEach(d=>chunks.push(...splitChunks(d.text,d.id,d.name,d.type)));
}

function updateStats(){
  document.getElementById("docCount").textContent=docs.length;
  document.getElementById("chunkCount").textContent=chunks.length;
  document.getElementById("storageSize").textContent=fmt(docs.reduce((s,d)=>s+(d.size||0),0));
}

function renderDocs(){
  const html=docs.length?docs.map(d=>`<div class="docItem"><h4>${esc(icon(d.type)+" "+d.name)}</h4><p>${d.type.toUpperCase()} • ${fmt(d.size)} • ${new Date(d.createdAt).toLocaleDateString("vi-VN")}</p><div class="docActions"><button class="mini" onclick="searchDoc('${d.id}')">Tìm trong file</button><button class="mini" onclick="copyDocName('${d.id}')">Copy tên</button><button class="mini" onclick="removeDoc('${d.id}')">Xóa</button></div></div>`).join(""):"<div class='summaryBox'>Chưa có tài liệu.</div>";
  docList.innerHTML=html;
  drawerDocs.innerHTML=html;
}

function icon(t){return t==="pdf"?"📕":t==="docx"?"📘":t==="txt"?"📄":"📎"}

function scoreChunk(text, terms){
  const lower=text.toLowerCase();
  let score=0;
  terms.forEach(t=>{
    const count=(lower.match(new RegExp(escapeReg(t.toLowerCase()),"g"))||[]).length;
    score+=count*(t.length>3?3:1);
  });
  return score;
}

function search(){
  const q=queryInput.value.trim();
  if(!q){toast("Nhập từ khóa để tra cứu.");return}
  const terms=q.split(/[\\s,;]+/).filter(x=>x.length>1);
  const source=chunks.filter(c=>filter==="all"||c.type===filter);
  let results=source.map(c=>({...c,score:scoreChunk(c.text,terms)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,100);
  lastResults=results.map(r=>({...r,query:q}));
  renderResults(results,q,terms);
  localStorage.setItem("pccc_last_query",q);
}

function renderResults(results,q,terms){
  document.getElementById("resultTitle").textContent=`Kết quả: ${results.length}`;
  if(!results.length){
    summaryBox.textContent=`Không tìm thấy nội dung liên quan đến “${q}”.`;
    resultList.innerHTML="";
    return;
  }
  const files=[...new Set(results.map(r=>r.fileName))];
  summaryBox.innerHTML=`Tìm thấy <b>${results.length}</b> đoạn liên quan trong <b>${files.length}</b> tài liệu. Kết quả được xếp theo mức độ khớp từ khóa.`;
  resultList.innerHTML=results.map((r,i)=>{
    const id=resultId(r);
    return `<article class="result"><div class="resultTop"><div><h4>${esc(icon(r.type)+" "+r.fileName)}</h4><div class="meta">${r.type.toUpperCase()} • đoạn ${r.idx+1} • điểm khớp ${r.score}</div></div></div><div class="snippet">${highlight(snippet(r.text,terms),terms)}</div><div class="resultActions"><button class="copyBtn" onclick="copyResult(${i})">Copy đoạn</button><button class="pinBtn ${pinned.has(id)?"active":""}" onclick="togglePin('${id}',${i})">📌 ${pinned.has(id)?"Đã ghim":"Ghim"}</button></div></article>`
  }).join("");
}

function snippet(text,terms){
  const lower=text.toLowerCase();
  let pos=0;
  for(const t of terms){const p=lower.indexOf(t.toLowerCase());if(p>=0){pos=p;break}}
  const start=Math.max(0,pos-180),end=Math.min(text.length,pos+520);
  return (start>0?"... ":"")+text.slice(start,end)+(end<text.length?" ...":"");
}

function highlight(text,terms){
  let out=esc(text);
  terms.filter(t=>t.length>1).forEach(t=>{
    out=out.replace(new RegExp(`(${escapeReg(esc(t))})`,"gi"),"<mark>$1</mark>");
  });
  return out;
}

function resultId(r){return r.docId+"_"+r.idx}
function togglePin(id,i){
  if(pinned.has(id))pinned.delete(id);else pinned.add(id);
  localStorage.setItem("pccc_pinned",JSON.stringify([...pinned]));
  if(lastResults.length) renderResults(lastResults,lastResults[0]?.query||queryInput.value,queryInput.value.split(/[\\s,;]+/).filter(x=>x.length>1));
}

function showPinned(){
  const pinnedResults=chunks.filter(c=>pinned.has(resultId(c))).map(c=>({...c,score:0}));
  lastResults=pinnedResults;
  document.getElementById("resultTitle").textContent="Kết quả đã ghim";
  summaryBox.innerHTML=`Có <b>${pinnedResults.length}</b> đoạn đã ghim.`;
  resultList.innerHTML=pinnedResults.map((r,i)=>`<article class="result"><h4>${esc(icon(r.type)+" "+r.fileName)}</h4><div class="meta">${r.type.toUpperCase()} • đoạn ${r.idx+1}</div><div class="snippet">${esc(snippet(r.text,[""]))}</div><div class="resultActions"><button class="copyBtn" onclick="copyPinned(${i})">Copy đoạn</button></div></article>`).join("");
}

async function removeDoc(id){if(confirm("Xóa tài liệu này khỏi thư viện?")){await delDoc(id);await refresh();toast("Đã xóa tài liệu.")}}
async function copyDocName(id){const d=docs.find(x=>x.id===id);if(d)navigator.clipboard.writeText(d.name)}
function searchDoc(id){const d=docs.find(x=>x.id===id);if(!d)return;filter=d.type;document.querySelectorAll(".chip[data-filter]").forEach(c=>c.classList.toggle("active",c.dataset.filter===d.type));queryInput.value=d.name.replace(/\\.(pdf|docx|txt)$/i,"").split(/[-_]/)[0];search()}
function copyResult(i){const r=lastResults[i];if(r){navigator.clipboard.writeText(`${r.fileName}\\n\\n${r.text}`);toast("Đã copy đoạn trích.")}}
function copyPinned(i){const r=lastResults[i];if(r){navigator.clipboard.writeText(`${r.fileName}\\n\\n${r.text}`);toast("Đã copy đoạn ghim.")}}

function exportResults(){
  if(!lastResults.length){toast("Chưa có kết quả để export.");return}
  const text=lastResults.map((r,i)=>`${i+1}. ${r.fileName} | ${r.type.toUpperCase()} | đoạn ${r.idx+1}\\n${r.text}\\n`).join("\\n---\\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
  a.download="ket-qua-tra-cuu-pccc.txt";
  a.click();
}

function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeReg(s){return String(s).replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}

fileInput.onchange=e=>addFiles(e.target.files);
dropZone.addEventListener("dragover",e=>{e.preventDefault();dropZone.classList.add("drag")});
dropZone.addEventListener("dragleave",()=>dropZone.classList.remove("drag"));
dropZone.addEventListener("drop",e=>{e.preventDefault();dropZone.classList.remove("drag");addFiles(e.dataTransfer.files)});
document.getElementById("searchBtn").onclick=search;
queryInput.addEventListener("keydown",e=>{if(e.key==="Enter")search()});
document.querySelectorAll(".chip[data-filter]").forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;document.querySelectorAll(".chip[data-filter]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");if(queryInput.value.trim())search()});
document.querySelectorAll(".quickKeys button").forEach(b=>b.onclick=()=>{queryInput.value=b.textContent;search()});
document.getElementById("exportBtn").onclick=exportResults;
document.getElementById("clearSearchBtn").onclick=()=>{queryInput.value="";resultList.innerHTML="";summaryBox.textContent="Đã xóa kết quả tìm kiếm.";lastResults=[]};
document.getElementById("pinnedBtn").onclick=showPinned;
document.getElementById("clearAllBtn").onclick=async()=>{if(confirm("Xóa toàn bộ thư viện tài liệu?")){await clearDocs();await refresh();toast("Đã xóa thư viện.")}};
document.getElementById("libraryBtn").onclick=()=>document.getElementById("drawer").classList.add("open");
document.getElementById("closeDrawerBtn").onclick=()=>document.getElementById("drawer").classList.remove("open");
document.getElementById("drawer").onclick=e=>{if(e.target.id==="drawer")e.target.classList.remove("open")};

(async()=>{db=await openDB();await refresh();const last=localStorage.getItem("pccc_last_query");if(last)queryInput.value=last})();
