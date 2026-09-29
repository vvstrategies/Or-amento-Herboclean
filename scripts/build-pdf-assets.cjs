const fs=require('node:fs');
fs.mkdirSync('public/vendor',{recursive:true});
fs.copyFileSync('node_modules/pdfkit/js/pdfkit.standalone.js','public/vendor/pdfkit.js');
fs.copyFileSync('node_modules/pdfkit/LICENSE','public/vendor/PDFKit-LICENSE.txt');
const fonts=Object.fromEntries(['regular','bold'].map(name=>[name,fs.readFileSync(`public/assets/plus-jakarta-${name}.ttf`).toString('base64')]));
fs.writeFileSync('public/pdf-fonts.js','globalThis.ECO_PDF_FONTS='+JSON.stringify(fonts)+';\n');
