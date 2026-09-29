const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync('C:/Users/geved/Downloads/manual-da-marca-ecoclean.html','utf8');
const target=path.resolve('public/assets');
fs.mkdirSync(target,{recursive:true});
const names=['ecoclean-colorida.png','ecoclean-branca-manual.png','ecoclean-monocromatica.png','ecoclean-verde.png','ecoclean-simbolo.png'];
for(let i=0;i<names.length;i++){
  const data=source.match(new RegExp('<img id="img'+i+'" src="data:image/png;base64,([^\"]+)"'));
  if(!data)throw Error('Logo ausente no manual: '+i);
  fs.writeFileSync(path.join(target,names[i]),Buffer.from(data[1],'base64'));
}
fs.copyFileSync('C:/Users/geved/Downloads/VV/logos/ecoclean-oficial.png',path.join(target,'ecoclean-oficial.png'));
const fonts=[...source.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)];
if(fonts.length!==2)throw Error('Esperados dois subconjuntos da fonte.');
fonts.forEach((m,i)=>fs.writeFileSync(path.join(target,`plus-jakarta-${i===0?'latin':'latin-ext'}.woff2`),Buffer.from(m[1],'base64')));
const logo='data:image/png;base64,'+fs.readFileSync(path.join(target,'ecoclean-oficial.png')).toString('base64');
const colorLogo='data:image/png;base64,'+fs.readFileSync(path.join(target,'ecoclean-colorida.png')).toString('base64');
fs.writeFileSync('public/brand-assets.js','globalThis.ECOCLEAN_ASSETS = '+JSON.stringify({logo,colorLogo})+';\n');
console.log('Logos originais e fontes extraídos do manual.');
