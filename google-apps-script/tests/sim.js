const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
let code=fs.readFileSync(process.argv[2],'utf8').replace("GEMINI_API_KEY: '',","GEMINI_API_KEY: 'g',").replace("GROQ_API_KEY: '',","GROQ_API_KEY: 'q',");
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
  Utilities:{formatDate:(d)=>d.toISOString().slice(0,10).replace(/-/g,'/'),getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(v,k)=>[...crypto.createHmac('sha256',k).update(v).digest()],
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
    const eng=url.includes('google')?'gemini':'groq'; fetches.push(eng);
    if(eng==='gemini' && fetches.filter(x=>x==='gemini').length===4) return {getResponseCode:()=>429,getContentText:()=>'rate'};
    const p=JSON.parse(o.payload).messages[1].content; let c;
    if(p.includes('JSON')) c='{"title":"أثر التعلم الإلكتروني","chapters":[{"title":"النظري","sections":["أ","ب"]},{"title":"التطبيقي","sections":["ج","د"]}]}';
    else if(p.startsWith('فيما يلي')) c=p.split('---\n')[1]+' (مُراجع)';
    else { const n=+((p.match(/نحو (\d+) كلمة/)||[0,120])[1]); const body=('فقرة **مهمة** (العلي، 2019) '.repeat(Math.ceil(n/4))).trim();
      if(p.includes('اكتب مستخلص')) c=body+'\n**الكلمات المفتاحية:** أ، ب، ج';
      else if(p.includes('قائمة المصادر')) c='### أولاً: المصادر العربية\n- العلي، م. (2019). كتاب. دار.\n- حسن، ع. (2020). كتاب. دار.\n- كاظم، ر. (2018). بحث. مجلة.\n### ثانياً: المصادر الأجنبية\n- Smith, J. (2020). Book. Press.\n- Doe, A. (2017). Article. Journal.';
      else if(p.includes('متن الفصل')) c='تمهيد الفصل '+body+'\n'+p.split('\n').filter(l=>l.startsWith('## ')).map(h=>h+'\n'+body).join('\n');
      else if(p.includes('مقدمة البحث')) c='تمهيد.\n### أولاً: مشكلة البحث\n'+body+'\n### ثانياً: أهمية البحث\nنص.\n### ثالثاً: أهداف البحث\nنص.';
      else if(p.includes('خاتمة البحث')) c='### أولاً: الاستنتاجات\n1- '+body+'\n### ثانياً: التوصيات\n1- توصية.';
      else c=body; }
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:c}}]})};
  }},
};
const body={setMarginTop(){return body},setMarginBottom(){return body},setMarginLeft(){return body},setMarginRight(){return body},
  appendParagraph:()=>para('p'),
  appendTable:(cells)=>{docLog.push({kind:'table',text:'',cells});const rows=cells.map(r=>({getNumCells:()=>r.length,getCell:j=>{const c={setPaddingTop:()=>c,setPaddingBottom:()=>c,setBackgroundColor:()=>c,getChild:()=>({asParagraph:()=>{const q=para('cell');q.text=r[j];return q}})};return c}}));
    const t={setBorderColor:()=>t,setBorderWidth:()=>t,getNumRows:()=>rows.length,getRow:i=>rows[i],setColumnWidth:()=>t};return t;},appendListItem:()=>para('li'),appendPageBreak:()=>para('pb'),getChild:i=>docLog[i]};
vm.createContext(g); vm.runInContext(code,g);
g.setup();
let r=vm.runInContext('submitRequest',g)({student_name:'أحمد',email:'s@x.com',university:'ج',college:'ك',department:'ق',governorate:'بغداد',supervisor:'م',title:'التعلم',details:'تفاصيل',language:'ar',pages:'25'});
console.log('25 pages ->',r.ok,r.errors);
r=g.submitRequest({student_name:'أحمد',email:'s@x.com',university:'ج',college:'ك',department:'ق',governorate:'بغداد',supervisor:'م',title:'التعلم',details:'تفاصيل',language:'ar',pages:'12'});
console.log('submit',r);
const html=mails[0].htmlBody; const link=html.match(/href="([^"]*a=approve[^"]*)"/)[1];
const q=new URL(link).searchParams;
console.log('review page ok:', g.doGet({parameter:{id:q.get('id'),a:q.get('a'),sig:q.get('sig')}}).html.includes('تأكيد الموافقة'));
console.log('bad sig:', g.reviewAction(1,'approve','bad'));
console.log(g.reviewAction(Number(q.get('id')),'approve',q.get('sig')));
let runs=0; while(triggers.length && runs<20){ triggers.length=0; g.processJobs(); runs++; }
console.log('runs',runs,'status',rows[1][2],'engines',rows[1][14],'fetches',fetches.join(','));
console.log('mails:',mails.map(m=>m.to+' | '+m.subject+' | '+(m.attachments||[]).map(a=>a.name).join(',')));
console.log('again:', g.reviewAction(1,'approve',q.get('sig')));
console.log('doc paras', docLog.length, 'rtl', docLog.filter(p=>p.ltr===false).length, 'job files left', Object.keys(files).filter(n=>n.startsWith('job')));
console.log('sample', docLog.filter(p=>p.text).slice(0,3).map(p=>p.text));
console.log('track ok:', JSON.stringify(g.trackRequest('#1','S@x.com')));
console.log('track bad:', JSON.stringify(g.trackRequest('1','other@x.com')));
console.log('track ar digits:', g.trackRequest('١','s@x.com').ok);

// واجهة doPost/doGet البرمجية (التي تستدعيها صفحة GitHub Pages)
const post=(fn,args)=>JSON.parse(g.doPost({postData:{contents:JSON.stringify({fn,args})}}).text);
console.log('api track:', JSON.stringify(post('trackRequest',['1','s@x.com'])).slice(0,60));
console.log('api submit bad:', JSON.stringify(post('submitRequest',[{email:'x'}])).slice(0,70));
console.log('api unknown:', JSON.stringify(post('setup',[])));
console.log('api broken body:', g.doPost({postData:{contents:'{bad'}}).text);
console.log('api config:', g.doGet({parameter:{api:'config'}}).text);
console.log('moved page:', g.doGet({parameter:{}}).html.includes('github.io/manhaj-'));
console.log('health:', g.doGet({parameter:{api:'health'}}).text.slice(0,400));
