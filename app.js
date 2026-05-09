const DB="pccc_legal_search_v2",STORE="docs";
let db,docs=[],chunks=[],filter="all",lastResults=[],pinned=new Set(JSON.parse(localStorage.getItem("pccc_pinned_v2")||"[]"));
const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropZone=$("dropZone"),docList=$("docList"),drawerDocs=$("drawerDocs"),resultList=$("resultList"),summaryBox=$("summaryBox"),queryInput=$("queryInput");

window.addEventListener("error",e=>toast("Lỗi app: "+(e.message||"không rõ")));
window.addEventListener("load",()=>{setTimeout(()=>{if(window.pdfjsLib){pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";} updateLibStatus();},600)});

function updateLibStatus(){
  const pdf=!!window.pdfjsLib, docx=!!window.mammoth;
  $("libStatus").textContent=`Trạng thái thư viện: PDF ${pdf?"OK":"chưa tải"} • DOCX ${docx?"OK":"chưa tải"}. TXT luôn dùng được.`;
}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function os(m="readonly"){return db.transaction(STORE,m).objectStore(STORE)}
function allDocs(){return new Promise((res,rej)=>{const r=os().getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function putDoc(d){return new Promise((res,rej)=>{const r=os("readwrite").put(d);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function delDoc(id){return new Promise((res,rej)=>{const r=os("readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearDocs(){return new Promise((res,rej)=>{const r=os("readwrite").clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function toast(msg){const e=document.createElement("div");e.className="toast";e.textContent=msg;document.body.appendChild(e);setTimeout(()=>e.remove(),2800)}
function fmt(n){if(!n)return"0 B";const u=["B","KB","MB","GB"];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return n.toFixed(i?1:0)+" "+u[i]}
function typeOf(name){const n=name.toLowerCase();if(n.endsWith(".pdf"))return"pdf";if(n.endsWith(".docx"))return"docx";if(n.endsWith(".txt"))return"txt";return"file"}
function icon(t){return t==="pdf"?"📕":t==="docx"?"📘":t==="txt"?"📄":"📎"}
function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeReg(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}

async function parsePdf(file){
  if(!window.pdfjsLib) throw new Error("pdf.js chưa tải. Hãy bật internet rồi reload trang.");
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  let pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    pages.push(`Trang ${p}\n`+content.items.map(i=>i.str).join(" "));
  }
  return pages.join("\n\n");
}
async function parseDocx(file){
  if(!window.mammoth) throw new Error("mammoth.js chưa tải. Hãy bật internet rồi reload trang.");
  const arrayBuffer=await file.arrayBuffer();
  const result=await mammoth.extractRawText({arrayBuffer});
  return result.value||"";
}
async function parseTxt(file){return await file.text();}

function splitChunks(text,docId,fileName,type){
  const clean=(text||"").replace(/\r/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
  const paras=clean.split(/\n\s*\n|(?=Điều\s+\d+[\.:])|(?=Khoản\s+\d+[\.:])/gi).map(x=>x.trim()).filter(x=>x.length>20);
  const out=[];
  paras.forEach((p,i)=>{if(p.length>1400){for(let j=0;j<p.length;j+=1000)out.push({docId,fileName,type,idx:i,text:p.slice(j,j+1200)})}else out.push({docId,fileName,type,idx:i,text:p})});
  return out;
}

async function addFiles(files){
  updateLibStatus();
  const arr=Array.from(files||[]).filter(f=>/\.(pdf|docx|txt)$/i.test(f.name));
  if(!arr.length){toast("Chưa chọn file PDF/DOCX/TXT hợp lệ.");return}
  for(const file of arr){
    try{
      toast("Đang đọc: "+file.name);
      const type=typeOf(file.name);
      let text= type==="pdf" ? await parsePdf(file) : type==="docx" ? await parseDocx(file) : await parseTxt(file);
      if(!text.trim()) throw new Error("không trích xuất được nội dung chữ");
      await putDoc({id:crypto.randomUUID(),name:file.name,type,size:file.size,text,createdAt:Date.now()});
      toast("Đã lưu: "+file.name);
    }catch(e){toast("Lỗi đọc "+file.name+": "+e.message)}
  }
  fileInput.value="";
  await refresh();
}

async function refresh(){docs=(await allDocs()).sort((a,b)=>b.createdAt-a.createdAt);chunks=[];docs.forEach(d=>chunks.push(...splitChunks(d.text,d.id,d.name,d.type)));renderDocs();updateStats()}
function updateStats(){$("docCount").textContent=docs.length;$("chunkCount").textContent=chunks.length;$("storageSize").textContent=fmt(docs.reduce((s,d)=>s+(d.size||0),0))}
function renderDocs(){
  const html=docs.length?docs.map(d=>`<div class="docItem" data-id="${d.id}"><h4>${icon(d.type)} ${esc(d.name)}</h4><p>${d.type.toUpperCase()} • ${fmt(d.size)} • ${new Date(d.createdAt).toLocaleDateString("vi-VN")}</p><div class="docActions"><button class="mini docSearch">Tìm trong file</button><button class="mini docCopy">Copy tên</button><button class="mini docRemove">Xóa</button></div></div>`).join(""):"<div class='summaryBox'>Chưa có tài liệu.</div>";
  docList.innerHTML=html;drawerDocs.innerHTML=html;
  document.querySelectorAll(".docItem").forEach(el=>{
    const id=el.dataset.id;
    el.querySelector(".docSearch").onclick=()=>searchDoc(id);
    el.querySelector(".docCopy").onclick=()=>{const d=docs.find(x=>x.id===id);if(d)navigator.clipboard.writeText(d.name)};
    el.querySelector(".docRemove").onclick=()=>removeDoc(id);
  });
}
async function removeDoc(id){if(confirm("Xóa tài liệu này khỏi thư viện?")){await delDoc(id);await refresh();toast("Đã xóa tài liệu.")}}
function searchDoc(id){const d=docs.find(x=>x.id===id);if(!d)return;filter=d.type;document.querySelectorAll(".chip[data-filter]").forEach(c=>c.classList.toggle("active",c.dataset.filter===d.type));queryInput.value=d.name.replace(/\.(pdf|docx|txt)$/i,"").split(/[-_]/)[0];search()}

function scoreChunk(text,terms){const lower=text.toLowerCase();let score=0;terms.forEach(t=>{const re=new RegExp(escapeReg(t.toLowerCase()),"g");const c=(lower.match(re)||[]).length;score+=c*(t.length>3?3:1)});return score}
function search(){
  const q=queryInput.value.trim();
  if(!q){toast("Nhập từ khóa để tra cứu.");return}
  const terms=q.split(/[\s,;]+/).filter(x=>x.length>1);
  const source=chunks.filter(c=>filter==="all"||c.type===filter);
  const results=source.map(c=>({...c,score:scoreChunk(c.text,terms)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,100);
  lastResults=results.map(r=>({...r,query:q}));
  renderResults(results,q,terms);
  localStorage.setItem("pccc_last_query_v2",q);
}
function renderResults(results,q,terms){
  $("resultTitle").textContent=`Kết quả: ${results.length}`;
  if(!results.length){summaryBox.textContent=`Không tìm thấy nội dung liên quan đến “${q}”.`;resultList.innerHTML="";return}
  const files=[...new Set(results.map(r=>r.fileName))];
  summaryBox.innerHTML=`Tìm thấy <b>${results.length}</b> đoạn liên quan trong <b>${files.length}</b> tài liệu.`;
  resultList.innerHTML=results.map((r,i)=>{
    const rid=r.docId+"_"+r.idx;
    return `<article class="result"><h4>${icon(r.type)} ${esc(r.fileName)}</h4><div class="meta">${r.type.toUpperCase()} • đoạn ${r.idx+1} • điểm ${r.score}</div><div class="snippet">${highlight(snippet(r.text,terms),terms)}</div><div class="resultActions"><button class="copyBtn" data-i="${i}">Copy đoạn</button><button class="pinBtn ${pinned.has(rid)?"active":""}" data-i="${i}" data-rid="${rid}">📌 ${pinned.has(rid)?"Đã ghim":"Ghim"}</button></div></article>`;
  }).join("");
  document.querySelectorAll(".copyBtn").forEach(b=>b.onclick=()=>copyResult(+b.dataset.i));
  document.querySelectorAll(".pinBtn").forEach(b=>b.onclick=()=>togglePin(b.dataset.rid));
}
function snippet(text,terms){const lower=text.toLowerCase();let pos=0;for(const t of terms){const p=lower.indexOf(t.toLowerCase());if(p>=0){pos=p;break}}const start=Math.max(0,pos-180),end=Math.min(text.length,pos+520);return(start>0?"... ":"")+text.slice(start,end)+(end<text.length?" ...":"")}
function highlight(text,terms){let out=esc(text);terms.filter(t=>t.length>1).forEach(t=>{out=out.replace(new RegExp(`(${escapeReg(esc(t))})`,"gi"),"<mark>$1</mark>")});return out}
function copyResult(i){const r=lastResults[i];if(r){navigator.clipboard.writeText(`${r.fileName}\n\n${r.text}`);toast("Đã copy đoạn trích.")}}
function togglePin(id){if(pinned.has(id))pinned.delete(id);else pinned.add(id);localStorage.setItem("pccc_pinned_v2",JSON.stringify([...pinned]));if(queryInput.value.trim())search()}
function showPinned(){const rs=chunks.filter(c=>pinned.has(c.docId+"_"+c.idx)).map(c=>({...c,score:0}));lastResults=rs;$("resultTitle").textContent="Kết quả đã ghim";summaryBox.innerHTML=`Có <b>${rs.length}</b> đoạn đã ghim.`;resultList.innerHTML=rs.map((r,i)=>`<article class="result"><h4>${icon(r.type)} ${esc(r.fileName)}</h4><div class="meta">${r.type.toUpperCase()} • đoạn ${r.idx+1}</div><div class="snippet">${esc(snippet(r.text,[""]))}</div><div class="resultActions"><button class="copyBtn" data-i="${i}">Copy đoạn</button></div></article>`).join("");document.querySelectorAll(".copyBtn").forEach(b=>b.onclick=()=>copyResult(+b.dataset.i))}
function exportResults(){if(!lastResults.length){toast("Chưa có kết quả để export.");return}const text=lastResults.map((r,i)=>`${i+1}. ${r.fileName} | ${r.type.toUpperCase()} | đoạn ${r.idx+1}\n${r.text}\n`).join("\n---\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));a.download="ket-qua-tra-cuu-pccc.txt";a.click()}

$("pickFileBtn").onclick=()=>fileInput.click();$("pickFileBtn2").onclick=()=>fileInput.click();
fileInput.onchange=e=>addFiles(e.target.files);
dropZone.addEventListener("dragover",e=>{e.preventDefault();dropZone.classList.add("drag")});
dropZone.addEventListener("dragleave",()=>dropZone.classList.remove("drag"));
dropZone.addEventListener("drop",e=>{e.preventDefault();dropZone.classList.remove("drag");addFiles(e.dataTransfer.files)});
$("searchBtn").onclick=search;queryInput.addEventListener("keydown",e=>{if(e.key==="Enter")search()});
document.querySelectorAll(".chip[data-filter]").forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;document.querySelectorAll(".chip[data-filter]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");if(queryInput.value.trim())search()});
document.querySelectorAll(".quickKeys button").forEach(b=>b.onclick=()=>{queryInput.value=b.textContent;search()});
$("exportBtn").onclick=exportResults;$("clearSearchBtn").onclick=()=>{queryInput.value="";resultList.innerHTML="";summaryBox.textContent="Đã xóa kết quả tìm kiếm.";lastResults=[]};$("pinnedBtn").onclick=showPinned;
$("clearAllBtn").onclick=async()=>{if(confirm("Xóa toàn bộ thư viện tài liệu?")){await clearDocs();await refresh();toast("Đã xóa thư viện.")}};
$("libraryBtn").onclick=()=>$("drawer").classList.add("open");$("closeDrawerBtn").onclick=()=>$("drawer").classList.remove("open");$("drawer").onclick=e=>{if(e.target.id==="drawer")e.target.classList.remove("open")};
(async()=>{db=await openDB();await refresh();const last=localStorage.getItem("pccc_last_query_v2");if(last)queryInput.value=last;updateLibStatus()})();
