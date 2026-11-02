const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1080,height:1350}}); const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+path.join(__dirname,'cards.html')); await p.evaluate(()=>document.fonts.ready);
 const ks=await p.evaluate(()=>window.CARDS);
 for(const k of ks){await p.evaluate(k=>window.show(k),k); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(150);
  const el=await p.$('.card'); await el.screenshot({path:path.join(__dirname,'img',k+(k==='avatar'?'.png':'.jpg')),...(k==='avatar'?{}:{type:'jpeg',quality:90})});}
 console.log(ks.length,'cards; errors:',errs.length?errs:'none'); await b.close();})();
