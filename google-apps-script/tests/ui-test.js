const fs=require('fs'), vm=require('vm');
const {chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const S=process.argv[2];
const g={console,Logger:{log(){}}}; vm.createContext(g);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','Code.gs'),'utf8'),g);
const stub='<script>window.google={script:{run:(function(){var h={};var o={withSuccessHandler:function(f){h.s=f;return o},withFailureHandler:function(f){h.f=f;return o},submitRequest:function(d){window.__sent=d;setTimeout(function(){h.s({ok:true,id:17,email:d.email})},400)}};return o})()}};</script>';
fs.writeFileSync(S+'/form.html', g.formPage_().replace('<body>','<body>'+stub));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  for (const [name,w,h,scheme] of [['desk-light',1200,1100,'light'],['phone-dark',390,1500,'dark']]) {
    const p=await b.newPage({viewport:{width:w,height:h},colorScheme:scheme});
    await p.goto('file://'+S+'/form.html'); await p.waitForTimeout(1500);
    await p.screenshot({path:S+'/ui-'+name+'.png'});
    if(name==='phone-dark'){
      await p.click('#next'); await p.waitForTimeout(300); await p.screenshot({path:S+'/ui-err.png'});
      await p.fill('#student_name','أحمد علي'); await p.fill('#email','ahmed@gmail.com'); await p.click('#next');
      await p.click('#next'); await p.waitForTimeout(300); await p.screenshot({path:S+'/ui-step2err.png'}); await p.selectOption('#governorate','بابل'); for (const [k,v] of [['university','جامعة بابل'],['college','كلية التربية'],['department','قسم الحاسبات'],['supervisor','د. سارة']]) await p.fill('#'+k,v);
      await p.click('#next'); await p.fill('#title','أثر التعلم الإلكتروني'); await p.fill('#details','فصل نظري وفصل تطبيقي');
      await p.locator('#pages').fill('18'); await p.click('#next'); await p.waitForTimeout(500);
      await p.screenshot({path:S+'/ui-review.png'});
      await p.screenshot({path:S+'/ui-review-full.png',fullPage:true}); await p.click('#next'); await p.waitForTimeout(1200);
      await p.screenshot({path:S+'/ui-done.png',fullPage:true});
      console.log('sent', JSON.stringify(await p.evaluate(()=>window.__sent)));
      const p2=await b.newPage({viewport:{width:390,height:900},colorScheme:'light'});
      await p2.goto('file://'+S+'/form.html'); await p2.waitForTimeout(800);
      console.log('remembered:', await p2.inputValue('#university'), '| welcome visible:', await p2.isVisible('#welcome'));
      const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth); console.log('h-overflow',ov);
    }
  }
  await b.close();
})();
