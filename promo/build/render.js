const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const path=require('path'),fs=require('fs');
const [,, mode, outDir, fpsArg]=process.argv;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'index.html')); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(300);
  fs.mkdirSync(outDir,{recursive:true});
  const D=await p.evaluate(()=>window.DURATION);
  if(mode==='preview'){
    const T=JSON.parse(fs.readFileSync(path.join(__dirname,'timing.json'))); const times=[];
    T.scenes.forEach((s,i)=>{const e=i<5?T.scenes[i+1]:D; times.push(s+1.4, (s+e)/2+0.8, e-0.5);});
    times.push(D-0.2);
    let k=0; for(const t of times){ await p.evaluate(t=>window.seek(t),t); await p.screenshot({path:`${outDir}/p${String(k++).padStart(2,'0')}_${t.toFixed(1)}.jpg`,type:'jpeg',quality:80}); }
  } else {
    const fps=+fpsArg||30, n=Math.ceil(D*fps);
    for(let i=0;i<n;i++){ await p.evaluate(t=>window.seek(t),i/fps); await p.screenshot({path:`${outDir}/f${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92}); }
    console.log('frames',n);
  }
  console.log('errors:',errs.length?errs:'none','duration',D);
  await b.close();
})();
