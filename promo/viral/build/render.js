const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const path=require('path'),fs=require('fs');
const [,, mode, outDir, arg]=process.argv;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://'+path.join(__dirname,'index.html')); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
  fs.mkdirSync(outDir,{recursive:true});
  const D=await p.evaluate(()=>window.DURATION);
  if(mode==='preview'){
    const times=arg.split(',').map(Number);
    for(const t of times){ await p.evaluate(t=>window.seek(t),t); await p.screenshot({path:`${outDir}/p_${t.toFixed(2)}.jpg`,type:'jpeg',quality:70}); }
  } else {
    const fps=+arg||30, n=Math.ceil(D*fps);
    for(let i=0;i<n;i++){ await p.evaluate(t=>window.seek(t),i/fps); await p.screenshot({path:`${outDir}/f${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92}); }
    console.log('frames',n);
  }
  console.log('errors:',errs.length?errs:'none','duration',D);
  await b.close();
})();
