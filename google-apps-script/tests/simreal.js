const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
let code=fs.readFileSync(process.argv[2],'utf8').replace("GEMINI_API_KEY: '',","GEMINI_API_KEY: '"+process.env.GEMINI_API_KEY+"',").replace("'gemini-flash-latest', 'gemini-3.7-flash', ","");
const props={}, cache={}, files={}, mails=[], triggers=[], fetches=[];
const rows=[];
const sheet={ appendRow:r=>rows.push(r.slice()), getLastRow:()=>rows.length, setFrozenRows(){}, setRightToLeft(){}, setName(){},
  getRange:(r,c,nr,nc)=>({ getValues:()=>{const o=[];for(let i=0;i<(nr||1);i++){o.push(rows[r-1+i].slice(c-1,c-1+(nc||1)))}return o;},
    setValue:v=>{rows[r-1][c-1]=v;}, setValues:v=>{if(!rows[r-1])rows[r-1]=[];v[0].forEach((x,i)=>rows[r-1][c-1+i]=x)} }) };
function mkFile(name,data){const f={name,data,trashed:false,getBlob:()=>({getDataAsString:()=>f.data}),setContent:d=>{f.data=d},setTrashed:t=>{f.trashed=t;delete files[name]},moveTo(){},
  getAs:()=>({setName:n=>({name:n,type:'pdf'})})};files[name]=f;return f;}
const folder={getFilesByName:n=>{const f=files[n];let done=!f;return{hasNext:()=>!done,next:()=>{done=true;return f}}},createFile:(n,d)=>mkFile(n,d),getId:()=>'F'};
let docLog=[];
function para(kind){const p={kind,text:'',setSpacingBefore:()=>p,setSpacingAfter:()=>p,editAsText:()=>({setBold:()=>p}),appendText:t=>{p.text+=t;return{setBold:b=>{if(b)p.bold=true}}},setHeading:h=>{p.h=h;return p},setAttributes:()=>p,setLeftToRight:v=>{p.ltr=v;return p},
  setAlignment:a=>p,setGlyphType:()=>p,setIndentFirstLine:()=>p,setIndentStart:()=>p,getType:()=>'P',asParagraph:()=>p,getText:()=>p.text,removeFromParent:()=>{docLog.shift()}};docLog.push(p);return p;}
const g={
  Logger:{log:console.log}, console,
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>props,getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
  SpreadsheetApp:{create:()=>({getSheets:()=>[sheet],getId:()=>'SS',getUrl:()=>'url'}),openById:()=>({getSheets:()=>[sheet],getUrl:()=>'url'})},
  DriveApp:{createFolder:()=>folder,getFolderById:()=>folder,getFileById:id=>id==='DOC'?mkFile('doc'):{moveTo(){}}},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(v,k)=>[...crypto.createHmac('sha256',k).update(v).digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},
  Session:{getEffectiveUser:()=>({getEmail:()=>'admin@x.com'})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'}),getProjectTriggers:()=>triggers,deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),
    newTrigger:fn=>({timeBased:()=>({after:ms=>({create:()=>triggers.push({fn,ms,getHandlerFunction:()=>fn})}),everyMinutes:m=>({create:()=>{}})})}),getOAuthToken:()=>'tok'},
  LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v}})},
  MailApp:{sendEmail:o=>mails.push(o)},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this}})},
  HtmlService:{XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:h=>({html:h,setTitle(){return this},addMetaTag(){return this},setXFrameOptionsMode(){return this}})},
  DocumentApp:{create:()=>{docLog=[];para('first');return{getBody:()=>body,saveAndClose(){},getId:()=>'DOC',getUrl:()=>'docurl'}},
    Attribute:{},HorizontalAlignment:{},ParagraphHeading:{HEADING1:1,HEADING2:2,HEADING3:3},GlyphType:{},ElementType:{PARAGRAPH:'P'}},
  UrlFetchApp:{fetch:(url,o)=>{
    if(url.includes('export?format=docx')) return {getBlob:()=>({setName:n=>({name:n})})};
    const eng=JSON.parse(o.payload).model; fetches.push(eng);
    const cp=require('child_process');
    const out=cp.execFileSync('curl',['-sS','-m','120','-w','\n%{http_code}',url,'-H','Authorization: '+o.headers.Authorization,'-H','Content-Type: application/json','--data-binary','@-'],{input:o.payload}).toString();
    const i=out.lastIndexOf('\n'); const bodyT=out.slice(0,i), codeN=Number(out.slice(i+1));
    return {getResponseCode:()=>codeN,getContentText:()=>bodyT};
    if(eng==='gemini' && fetches.filter(x=>x==='gemini').length===4) return {getResponseCode:()=>429,getContentText:()=>'rate'};
    const p=JSON.parse(o.payload).messages[1].content; let c;
    if(p.includes('JSON')) c='{"title":"أثر التعلم الإلكتروني","chapters":[{"title":"النظري","sections":["أ","ب"]},{"title":"التطبيقي","sections":["ج","د"]}]}';
    else if(p.startsWith('فيما يلي')) c=p.split('---\n')[1]+' (مُراجع)';
    else c='### مبحث\nفقرة **مهمة** (العلي، 2019).\n- نقطة';
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:c}}]})};
  }},
};
const body={setMarginTop(){return body},setMarginBottom(){return body},setMarginLeft(){return body},setMarginRight(){return body},
  appendParagraph:()=>para('p'),
  appendTable:(cells)=>{docLog.push({kind:'table',text:'',cells});const rows=cells.map(r=>({getNumCells:()=>r.length,getCell:j=>{const c={setPaddingTop:()=>c,setPaddingBottom:()=>c,setBackgroundColor:()=>c,getChild:()=>({asParagraph:()=>{const q=para('cell');q.text=r[j];return q}})};return c}}));
    const t={setBorderColor:()=>t,setBorderWidth:()=>t,getNumRows:()=>rows.length,getRow:i=>rows[i],setColumnWidth:()=>t};return t;},appendListItem:()=>para('li'),appendPageBreak:()=>para('pb'),getChild:i=>docLog[i]};
vm.createContext(g); vm.runInContext(code,g);
g.setup();
let r=vm.runInContext('submitRequest',g)({student_name:'أحمد',email:'s@x.com',university:'ج',college:'ك',department:'ق',governorate:'بغداد',supervisor:'م',title:'أثر التعلم الإلكتروني في التحصيل الدراسي لطلبة الجامعة',details:'أريد فصلاً نظرياً عن مفهوم التعلم الإلكتروني وأنواعه، وفصلاً عن أثره في التحصيل مع عرض دراسات سابقة.',language:'ar',pages:'25'});
console.log('25 pages ->',r.ok,r.errors);
r=g.submitRequest({student_name:'أحمد',email:'s@x.com',university:'ج',college:'ك',department:'ق',governorate:'بغداد',supervisor:'م',title:'أثر التعلم الإلكتروني في التحصيل الدراسي لطلبة الجامعة',details:'أريد فصلاً نظرياً عن مفهوم التعلم الإلكتروني وأنواعه، وفصلاً عن أثره في التحصيل مع عرض دراسات سابقة.',language:'ar',pages:'5'});
console.log('submit',r);
const html=mails[0].htmlBody; const link=html.match(/href="([^"]*a=approve[^"]*)"/)[1];
const q=new URL(link).searchParams;
console.log('review page ok:', g.doGet({parameter:{id:q.get('id'),a:q.get('a'),sig:q.get('sig')}}).html.includes('تأكيد الموافقة'));
console.log('bad sig:', g.reviewAction(1,'approve','bad'));
console.log(g.reviewAction(Number(q.get('id')),'approve',q.get('sig')));
let runs=0; while(triggers.length && runs<25){ const t=triggers[0]; triggers.length=0; if(t.ms>5000){ Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.min(t.ms,65000)); for (const k in cache) if(!/3\.6|3\.5-flash'|3\.5-flash$/.test(k)) delete cache[k]; } g.processJobs(); runs++; }
console.log('runs',runs,'status',rows[1][2],'engines',rows[1][14],'fetches',fetches.join(','));
console.log('mails:',mails.map(m=>m.to+' | '+m.subject+' | '+(m.attachments||[]).map(a=>a.name).join(',')));
console.log('again:', g.reviewAction(1,'approve',q.get('sig')));
console.log('doc paras', docLog.length, 'rtl', docLog.filter(p=>p.ltr===false).length, 'job files left', Object.keys(files).filter(n=>n.startsWith('job')));
console.log('sample', docLog.filter(p=>p.text).slice(0,3).map(p=>p.text));

console.log('---- doc text ----'); for (const p of docLog.filter(x=>x.kind==='table')) console.log('[TABLE]', JSON.stringify(p.cells).slice(0,400));
console.log(docLog.filter(p=>p.text).map(p=>(p.h?'#'+p.h+' ':'')+(p.ltr?'[LTR] ':'')+p.text.slice(0,90)).join('\n'));
