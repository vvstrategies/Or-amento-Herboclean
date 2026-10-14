import {Jimp} from 'jimp';
import {fail,hash} from './database.js';

// Foto do cliente: por padrão a primeira foto do orçamento; o usuário pode escolher outra no detalhe.
// O servidor entrega só uma miniatura quadrada, para o kanban e a lista de clientes continuarem leves.
const SIZE=128,CACHE=400;
const thumbs=new Map();
const photoAt=(q,pick)=>{const [i,p]=String(pick||'').split(':').map(Number);return q?.items?.[i]?.photos?.[p]||null};
const firstPhoto=q=>{for(const [i,item] of (q?.items||[]).entries())if(item.photos?.length)return i+':0';return null};

export class AvatarService{
  constructor(repo,commercial){this.repo=repo;this.commercial=commercial}
  choices(){return this.repo.config('quote-avatars')||{}}
  // Foto escolhida para o orçamento (se ainda existir) ou a primeira disponível.
  proposalPhoto(q){const pick=this.choices()[q.id];return photoAt(q,pick)||photoAt(q,firstPhoto(q))}
  choose(id,raw){
    const q=this.repo.requireProposal(id),item=Number(raw?.item),photo=Number(raw?.photo);
    if(!Number.isInteger(item)||!Number.isInteger(photo)||!photoAt(q,item+':'+photo))throw fail(400,'Escolha uma das fotos deste orçamento.');
    const all={...this.choices(),[id]:item+':'+photo};this.repo.setConfig('quote-avatars',all);
    const link=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(id),c=link&&this.commercial.client(link.client_id);
    if(c)this.commercial.writeClient(c.id,{...this.commercial.clientInput({},c),avatar:{proposalId:id}},c.createdAt);
    return {proposalId:id,item,photo};
  }
  // Cliente: o orçamento escolhido como foto; senão o mais recente com fotos.
  clientPhoto(clientId){
    const c=this.commercial.client(clientId);if(!c)throw fail(404,'Cliente não encontrado.');
    const ids=this.repo.db.prepare('SELECT proposal_id FROM client_links WHERE client_id=?').all(clientId).map(r=>r.proposal_id);
    const chosen=c.avatar?.proposalId&&ids.includes(c.avatar.proposalId)?[c.avatar.proposalId]:[];
    const quotes=[...chosen,...ids].map(id=>this.repo.proposal(id)).filter(Boolean);
    if(!chosen.length)quotes.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    for(const q of quotes){const p=this.proposalPhoto(q);if(p)return p}
    return null;
  }
  async thumbnail(dataUrl){
    const m=/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl||'');if(!m)throw fail(404,'Sem foto.');
    const key=hash(m[1]);if(thumbs.has(key)){const v=thumbs.get(key);thumbs.delete(key);thumbs.set(key,v);return v}
    const img=await Jimp.read(Buffer.from(m[1],'base64'));img.cover({w:SIZE,h:SIZE});
    const value={etag:'"'+key.slice(0,32)+'"',body:await img.getBuffer('image/jpeg',{quality:74})};
    thumbs.set(key,value);if(thumbs.size>CACHE)thumbs.delete(thumbs.keys().next().value);return value;
  }
}

export function registerAvatars(app,service,wrap){
  // Sem foto responde 204: a tela mantém as iniciais sem registrar erro no navegador.
  const send=async(req,res,photo)=>{if(!photo)return res.set('Cache-Control','private, no-cache').status(204).end();const t=await service.thumbnail(photo);res.set({'Cache-Control':'private, no-cache',ETag:t.etag});if(req.headers['if-none-match']===t.etag)return res.status(304).end();res.type('jpeg').send(t.body)};
  app.get('/api/proposals/:id/avatar',wrap(async(req,res)=>{const q=service.repo.proposal(req.params.id);if(!q)throw fail(404,'Orçamento não encontrado.');await send(req,res,service.proposalPhoto(q))}));
  app.put('/api/proposals/:id/avatar',(req,res)=>res.json(service.choose(req.params.id,req.body)));
  app.get('/api/clients/:id/avatar',wrap(async(req,res)=>send(req,res,service.clientPhoto(req.params.id))));
}
