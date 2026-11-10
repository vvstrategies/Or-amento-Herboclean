// Gera os ícones do app instalado (PWA/iPhone): quadrado inteiro em verde com degradê leve e o símbolo no centro.
// Uso: node scripts/make-app-icon.mjs  → public/assets/app-icon-512.png, app-icon-192.png, apple-touch-icon.png
import {Jimp} from 'jimp';

const SRC='public/assets/herboclean-icon.png';
const TOP=[0x0b,0x6b,0x50],BOTTOM=[0x04,0x4c,0x3a]; // verde da marca (#044c3a) clareando levemente para cima
const mix=(a,b,t)=>Math.round(a+(b-a)*t);

async function make(size,file,scale){
 const img=new Jimp({width:size,height:size,color:0xffffffff});
 // Degradê diagonal suave (canto superior esquerdo mais claro).
 img.scan(0,0,size,size,function(x,y,idx){
  const t=Math.min(1,(x*0.35+y)/(size*1.35));
  this.bitmap.data[idx]=mix(TOP[0],BOTTOM[0],t);this.bitmap.data[idx+1]=mix(TOP[1],BOTTOM[1],t);this.bitmap.data[idx+2]=mix(TOP[2],BOTTOM[2],t);this.bitmap.data[idx+3]=255;
 });
 const mark=await Jimp.read(SRC);
 const w=Math.round(size*scale);mark.resize({w});
 img.composite(mark,Math.round((size-mark.bitmap.width)/2),Math.round((size-mark.bitmap.height)/2));
 await img.write(file);
 console.log(file,size+'px');
}
// Símbolo em ~70%: fica dentro da área segura dos ícones "maskable" (círculo de 80%).
await make(512,'public/assets/app-icon-512.png',0.70);
await make(192,'public/assets/app-icon-192.png',0.70);
await make(180,'public/assets/apple-touch-icon.png',0.70);
