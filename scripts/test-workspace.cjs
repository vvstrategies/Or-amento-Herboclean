const {spawn}=require('node:child_process');
const fixture=spawn(process.execPath,['scripts/browser-fixture.mjs'],{windowsHide:true,stdio:['ignore','pipe','inherit']});let browser,started=false;
const timer=setTimeout(()=>{browser?.kill();fixture.kill();process.exitCode=1},190000);
fixture.stdout.on('data',data=>{if(started||!data.toString().includes('Fixture ready'))return;started=true;browser=spawn(process.execPath,['scripts/check-workspace.cjs'],{windowsHide:true,stdio:'inherit'});browser.on('exit',code=>{clearTimeout(timer);fixture.kill();process.exitCode=code||0})});
fixture.on('exit',code=>{if(!started){clearTimeout(timer);process.exitCode=code||1}});
