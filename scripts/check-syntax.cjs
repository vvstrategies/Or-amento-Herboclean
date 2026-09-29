const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=['server.js',...['backend','utils','public','scripts'].flatMap(dir=>fs.readdirSync(dir).filter(f=>/\.(js|cjs|mjs)$/.test(f)).map(f=>path.join(dir,f)))];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});if(result.status){process.stderr.write(result.stderr);process.exit(result.status||1)}}
console.log('PASS: sintaxe de '+files.length+' arquivos JavaScript. Projeto sem etapa de build ou configuração de lint/TypeScript.');
