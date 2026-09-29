const fs=require('node:fs');
const html=fs.readFileSync('templates/index.html','utf8');
fs.writeFileSync('public/index.html',html);
fs.writeFileSync('index.html',html.replace('<head>','<head><base href="./public/">'));
console.log('Interface sincronizada para uso local e no servidor.');
