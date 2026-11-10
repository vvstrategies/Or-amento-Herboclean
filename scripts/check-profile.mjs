// Perfil do chip do menu: migração única da Herboclean (Gabriel + foto), sem sobrescrever perfil existente,
// sem tocar outras empresas, e foto recortada em 256×256 JPEG.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Jimp} from 'jimp';
import {Repository} from '../backend/database.js';
import {adoptHerbocleanProfile} from '../backend/herboclean-installation.js';
import {profileOf,profilePhotoFrom} from '../backend/avatars.js';

const seed='data:image/jpeg;base64,'+fs.readFileSync(new URL('../backend/seed/profile-gabriel.jpg',import.meta.url)).toString('base64');
const dirs=[];const repoWith=company=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'herbo-profile-'));dirs.push(d);const r=new Repository(d);if(company)r.setConfig('settings',{company});return r};
try{
 const herbo=repoWith({name:'Herboclean'});adoptHerbocleanProfile(herbo,()=>seed);
 assert.deepEqual({...profileOf(herbo),updatedAt:null},{name:'Gabriel',subtitle:'Herboclean',hasPhoto:true,updatedAt:null});
 herbo.setConfig('user-profile',{name:'Outro',subtitle:'X'});herbo.setConfig('herboclean-profile-v1',null);adoptHerbocleanProfile(herbo,()=>seed);
 assert.equal(profileOf(herbo).name,'Outro','perfil existente não é sobrescrito');
 const other=repoWith({name:'Lavanderia Azul'});adoptHerbocleanProfile(other,()=>seed);
 assert.equal(profileOf(other).name,'');assert.equal(profileOf(other).hasPhoto,false);assert.equal(other.config('herboclean-profile-v1'),true);
 const fresh=repoWith(null);adoptHerbocleanProfile(fresh,()=>seed);assert.equal(fresh.config('herboclean-profile-v1'),null,'instalação sem empresa decide depois');
 const big=new Jimp({width:900,height:500,color:0x044c3aff}),url='data:image/png;base64,'+(await big.getBuffer('image/png')).toString('base64');
 const out=await profilePhotoFrom(url),img=await Jimp.read(Buffer.from(out.split(',')[1],'base64'));
 assert.ok(out.startsWith('data:image/jpeg;base64,'));assert.equal(img.width,256);assert.equal(img.height,256);
 await assert.rejects(profilePhotoFrom('data:text/html;base64,PGI+'),e=>e.status===400);
 for(const r of [herbo,other,fresh])r.close();
 console.log('PASS: perfil — migração Gabriel/Herboclean única, sem sobrescrever, só na Herboclean, foto 256×256 e tipos recusados.');
}finally{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true})}
