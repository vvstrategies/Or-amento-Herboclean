// Regras compartilhadas do ciclo de vida OAuth do Google (Calendar/Drive/Contatos e Google Ads).
// Cada integração mantém o próprio cliente OAuth e os próprios escopos; aqui ficam só as decisões
// que precisam ser iguais em todas: o que é revogação real, o que é falha temporária e como
// renovar sem perder o refresh token.

export const GOOGLE_SCOPES={
  calendar:'https://www.googleapis.com/auth/calendar.events.owned',
  drive:'https://www.googleapis.com/auth/drive.file',
  contacts:'https://www.googleapis.com/auth/contacts.readonly',
  ads:'https://www.googleapis.com/auth/adwords'
};

// Resultado do endpoint de token:
//  revoked   → invalid_grant: refresh token expirado/revogado (inclui apps em modo Testing após 7 dias).
//  config    → credenciais do app inválidas (client id/secret): erro de configuração, não do usuário.
//  temporary → rede, timeout, 429 ou 5xx: a conexão continua válida e a próxima tentativa deve funcionar.
export function classifyTokenFailure(status,body){
  const code=typeof body?.error==='string'?body.error:'';
  if(code==='invalid_grant')return 'revoked';
  if(['invalid_client','unauthorized_client'].includes(code)||status===401)return 'config';
  if(status===429||status>=500||!status)return 'temporary';
  // 400 sem código conhecido: trata como temporário para não exigir reconexão sem evidência.
  return 'temporary';
}

// Nunca troca um refresh token válido por vazio: o Google normalmente não devolve um novo na renovação.
export function mergeRefreshedTokens(previous,response,now=Date.now()){
  const expiresIn=Number(response?.expires_in);
  const next={...previous,accessToken:response.access_token,expires:now+(Number.isFinite(expiresIn)&&expiresIn>0?expiresIn:3600)*1000};
  if(typeof response?.refresh_token==='string'&&response.refresh_token.trim())next.refreshToken=response.refresh_token;
  return next;
}

export const grantedScopes=value=>String(value||'').split(/\s+/).filter(Boolean);
