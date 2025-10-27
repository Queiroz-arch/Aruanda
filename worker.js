// worker.js  — API do painel + verificação de UIID para ESP32
// Rotas:
// - POST   /api/login                     (login por CPF/senha)
// - GET    /api/credentials               (lista credenciais - oculta senha)
// - POST   /api/credentials               (cria credencial + grava UIID)
// - PUT    /api/credentials/:cpf          (atualiza credencial + espelha no UIID)
// - DELETE /api/credentials/:cpf          (remove credencial + apaga UIID correspondente)
// - GET    /api/uiid?uuid=<uuid-do-cartao>    <<< usada pelo ESP32

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return handleCors(request);

    // ---- Roteador ----
    if (path === '/api/login' && method === 'POST')         return handleLogin(request, env);
    if (path === '/api/credentials' && method === 'GET')    return handleGetCredentials(request, env);
    if (path === '/api/credentials' && method === 'POST')   return handleCreateCredential(request, env);
    if (path.startsWith('/api/credentials/') && method === 'PUT')    return handleUpdateCredential(request, env);
    if (path.startsWith('/api/credentials/') && method === 'DELETE') return handleDeleteCredential(request, env);
    if (path === '/api/uiid' && method === 'GET')           return handleUIIDLookup(request, env);

    return json({ error: 'Not Found' }, 404, request);
  }
};

// ========================== ROTAS ==========================

async function handleLogin(request, env) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.cpf !== 'string' || typeof body.senha !== 'string') {
      return json({ error: 'Parâmetros inválidos.' }, 400, request);
    }
    const cpf = normalizeCPF(body.cpf);
    const senha = String(body.senha || '');
    if (!cpf || !senha) return json({ error: 'CPF e senha são obrigatórios.' }, 400, request);

    const userData = await getUser(env.CREDENCIAIS, cpf);
    if (!userData)                     return json({ error: 'CPF ou senha inválidos.' }, 401, request);
    if (userData.bloqueado === 'sim')  return json({ error: 'Usuário bloqueado.' }, 403, request);
    if (userData.senha !== senha)      return json({ error: 'CPF ou senha inválidos.' }, 401, request);

    // injeta tag/acessos e o UIID correto a partir do namespace UIID, por CPF
    const user = stripSenha(userData);
    // normaliza permissões para UI e flags
    user.permissao = formatPermissaoForUI(user.permissao || user.permissoes || user);
    addPermFlags(user);
    await hydrateFromUIID(env, user);

    return json({ ok: true, user }, 200, request);
  } catch (err) {
    console.error('Login error:', err);
    return json({ error: 'Erro no servidor.' }, 500, request);
  }
}

async function handleGetCredentials(request, env) {
  try {
    const kv = env.CREDENCIAIS;
    const { keys } = await kv.list(); // chaves são CPFs normalizados
    const users = [];
    for (const k of keys) {
      const u = await getUser(kv, k.name);
      if (!u) continue;
      if (u.funcao === 'Superadministrador') continue;
      const user = stripSenha(u);
      user.permissao = formatPermissaoForUI(user.permissao || user.permissoes || user);
      addPermFlags(user);
      await hydrateFromUIID(env, user);
      users.push(user);
    }
    return json({ ok: true, users }, 200, request);
  } catch (err) {
    console.error('Get credentials error:', err);
    return json({ error: 'Erro ao buscar credenciais.' }, 500, request);
  }
}

async function handleCreateCredential(request, env) {
  try {
    const body = await request.json();
    const validation = validateUserData(body);
    if (!validation.valid) return json({ error: validation.error }, 400, request);
    if (String(body.funcao || '').toLowerCase() === 'superadministrador') {
      return json({ error: 'Não é possível criar um Superadministrador.' }, 403, request);
    }

    const cpf = normalizeCPF(body.cpf);
    const kv  = env.CREDENCIAIS;
    const exists = await kv.get(cpf);
    if (exists) return json({ error: 'CPF já cadastrado.' }, 409, request);

    // gera UUID v4 para o usuário (UIID do cartão)
    const generateUUIDv4 = () =>
      (globalThis.crypto?.randomUUID?.() ??
       'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
         const r = Math.random()*16|0, v = c==='x'? r : (r&0x3)|0x8; return v.toString(16);
       }));

    const newUser = {
      ...body,
      cpf,
      email: (body.email || '').toLowerCase(),
      nome : (body.nome  || '').replace(/\d/g,''),
      id   : body.id && isUUID(body.id) ? body.id : generateUUIDv4(), // aceita ID enviado, senão gera
      tag  : '' // a tag verdadeira vive no UIID; mantemos vazio aqui para UI
    };

    // normaliza permissões para armazenamento
    newUser.permissao = normalizePermissao(body.permissao ?? body.permissoes ?? body);

    // Garantir que CREDENCIAIS não guarde id/tag/acessos (uuid será setado após gerar UIID)
    if (Object.prototype.hasOwnProperty.call(newUser,'id')) delete newUser.id;
    if (Object.prototype.hasOwnProperty.call(newUser,'tag')) delete newUser.tag;
    if (Object.prototype.hasOwnProperty.call(newUser,'acessos')) delete newUser.acessos;
    if (Object.prototype.hasOwnProperty.call(newUser,'acesso')) delete newUser.acesso;
    // adiamos o put até termos o uiidKey

    // cria/atualiza registro no namespace UIID com uma chave gerada (UUID v4)
    const uiidRecord = {
      cpf,
      funcao    : newUser.funcao,
      nome      : newUser.nome,
      acessos   : normalizeAcessos(body.acessos ?? body.acesso) || [],
      tag       : (body.tag === 'cadastrado') ? 'cadastrado' : '',
      bloqueado : body.bloqueado === 'sim' ? 'sim' : 'nao'
    };
    const uiStore = getUIID(env);
    let uiidKey = null;
    if (uiStore) {
      uiidKey = (globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{ const r=Math.random()*16|0, v=c==='x'?r:(r&0x3)|0x8; return v.toString(16);}));
      await uiStore.put(uiidKey, JSON.stringify(uiidRecord));
    }

    // Agora persistimos em CREDENCIAIS incluindo o uuid gerado para o KV UIID
    if (uiidKey) newUser.uuid = uiidKey;
    await kv.put(cpf, JSON.stringify(newUser));

    const user = stripSenha(newUser);
    user.permissao = formatPermissaoForUI(user.permissao);
    addPermFlags(user);
    if (uiidKey) { user.uiid = uiidKey; }
    await hydrateFromUIID(env, user);
    return json({ ok: true, user }, 201, request);
  } catch (err) {
    console.error('Create credential error:', err);
    return json({ error: 'Erro ao criar credencial.' }, 500, request);
  }
}

async function handleUpdateCredential(request, env) {
  try {
    const cpf = getCpfFromUrl(request.url);
    if (!cpf)    return json({ error: 'CPF inválido na URL.' }, 400, request);

    const kv = env.CREDENCIAIS;
    const existing = await getUser(kv, cpf);
    if (!existing) return json({ error: 'Usuário não encontrado.' }, 404, request);
    if (existing.funcao === 'Superadministrador') {
      return json({ error: 'Não é possível editar um Superadministrador.' }, 403, request);
    }

    const body = await request.json();
    const validation = validateUserData(body, true);
    if (!validation.valid) return json({ error: validation.error }, 400, request);

    // mantém senha/ID originais se não enviados
    const updated = { ...existing, ...body, cpf };
    if (!body.senha) updated.senha = existing.senha;
    if (Object.prototype.hasOwnProperty.call(body,'id')) updated.id = existing.id;

    if (updated.email) updated.email = updated.email.toLowerCase();
    if (updated.nome ) updated.nome  = updated.nome.replace(/[\d]/g,'');

    // normaliza permissões quando enviadas
    if (Object.prototype.hasOwnProperty.call(body,'permissao') || Object.prototype.hasOwnProperty.call(body,'permissoes') || ['criar','editar','apagar','segregar'].some(k=>Object.prototype.hasOwnProperty.call(body,k))) {
      updated.permissao = normalizePermissao(body.permissao ?? body.permissoes ?? body);
    }
    // Não persistir tag/acessos em CREDENCIAIS
    if (Object.prototype.hasOwnProperty.call(updated,'tag')) delete updated.tag;
    if (Object.prototype.hasOwnProperty.call(updated,'acessos')) delete updated.acessos;
    if (Object.prototype.hasOwnProperty.call(updated,'acesso')) delete updated.acesso;
    await kv.put(cpf, JSON.stringify(updated));

    // espelha campos mínimos no UIID usando a chave correta descoberta por CPF
    const uiStore = getUIID(env);
    const uiidKey = await findUIIDKeyByCPF(env, cpf);
    if (uiStore && uiidKey) {
      try {
        const oldRaw = await uiStore.get(uiidKey);
        const oldObj = oldRaw ? JSON.parse(oldRaw) : {};
        const next = {
          cpf,
          funcao    : updated.funcao,
          nome      : updated.nome,
          acessos   : normalizeAcessos(body.acessos ?? body.acesso) ?? oldObj.acessos,
          tag       : Object.prototype.hasOwnProperty.call(body,'tag') ? ((body.tag === 'cadastrado')?'cadastrado':'') : (oldObj.tag || ''),
          bloqueado : Object.prototype.hasOwnProperty.call(body,'bloqueado') ? (body.bloqueado === 'sim' ? 'sim':'nao') : (oldObj.bloqueado || 'nao')
        };
        await uiStore.put(uiidKey, JSON.stringify(next));
      } catch (e) { console.warn('UIID mirror update error:', e); }
    }

    const user = stripSenha(updated);
    user.permissao = formatPermissaoForUI(user.permissao || user.permissoes || user);
    addPermFlags(user);
    await hydrateFromUIID(env, user);
    return json({ ok: true, user }, 200, request);
  } catch (err) {
    console.error('Update credential error:', err);
    return json({ error: 'Erro ao atualizar credencial.' }, 500, request);
  }
}

async function handleDeleteCredential(request, env) {
  try {
    const cpf = getCpfFromUrl(request.url);
    if (!cpf)    return json({ error: 'CPF inválido na URL.' }, 400, request);

    const kv = env.CREDENCIAIS;
    const existing = await getUser(kv, cpf);
    if (!existing) return json({ error: 'Usuário não encontrado.' }, 404, request);
    if (existing.funcao === 'Superadministrador') {
      return json({ error: 'Não é possível apagar um Superadministrador.' }, 403, request);
    }

    await kv.delete(cpf);
    const __ui = getUIID(env); const __key = await findUIIDKeyByCPF(env, cpf); if (__ui && __key) { try { await __ui.delete(__key); } catch {} }

    return json({ ok: true }, 200, request);
  } catch (err) {
    console.error('Delete credential error:', err);
    return json({ error: 'Erro ao apagar credencial.' }, 500, request);
  }
}

// ---- NOVO: endpoint de verificação por UUID (para o ESP32)
async function handleUIIDLookup(request, env) {
  try {
    const url  = new URL(request.url);
    const uuid = (url.searchParams.get('uuid') || '').trim().toLowerCase();
    if (!isUUID(uuid)) return json({ ok: true, found: false }, 200, request);

    const raw = env.UIID ? await env.UIID.get(uuid) : null;
    if (!raw) return json({ ok: true, found: false }, 200, request);

    let obj = {};
    try { obj = JSON.parse(raw); } catch { obj = {}; }

    const bloqueado = String(obj.bloqueado || 'nao').toLowerCase() === 'sim';
    const nome = typeof obj.nome === 'string' ? obj.nome : '';
    return json({ ok: true, found: true, bloqueado, nome }, 200, request);
  } catch (err) {
    console.error('UIID lookup error:', err);
    // para o ESP é melhor não “quebrar” — responde found:false em falha
    return json({ ok: true, found: false }, 200, request);
  }
}

// ========================== HELPERS ==========================

function stripSenha(u){ const { senha: _omit, ...rest } = u || {}; return rest; }

async function hydrateFromUIID(env, user){
  if (!env || !user) return;
  const store = getUIID(env);
  if (!store) return;
  try{
    const key = await findUIIDKeyByCPF(env, user.cpf);
    if (!key) return;
    const raw = await store.get(key);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.acessos)) user.acessos = obj.acessos;
    user.tag = typeof obj.tag === 'string' ? obj.tag : '';
    user.uiid = key;
    try { user['tag-code'] = key; } catch {}
    try { user.uuid = key; } catch {}
  }catch{}
}

function getCpfFromUrl(urlString) {
  const parts = new URL(urlString).pathname.split('/');
  return normalizeCPF(parts[parts.length - 1] || '');
}

function normalizeCPF(s){ return String(s||'').replace(/\D/g,'').slice(0,11); }

// ======= Permissões =======
function normalizePermissao(input){
  const allowed = ['criar','editar','apagar','segregar'];
  const labels = { criar:'Criar', editar:'Editar', apagar:'Apagar', segregar:'Segregar' };
  const toLabels = (arr)=>{
    const out=[]; for(const v of arr){ const k=String(v).toLowerCase(); if(allowed.includes(k) && !out.includes(labels[k])) out.push(labels[k]); }
    return out;
  };
  if (Array.isArray(input)) return toLabels(input);
  if (input && typeof input==='object'){
    const keys=[]; for(const k of allowed){ if (Object.prototype.hasOwnProperty.call(input,k) && !!input[k]) keys.push(k); }
    if (Array.isArray(input.permissao)) return toLabels(input.permissao);
    if (Array.isArray(input.permissoes)) return toLabels(input.permissoes);
    return toLabels(keys);
  }
  if (typeof input==='string') return toLabels(input.split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean));
  return [];
}
function formatPermissaoForUI(perms){ return normalizePermissao(perms||[]); }
function addPermFlags(user){
  const set = new Set(formatPermissaoForUI(user.permissao));
  user.criar = set.has('Criar');
  user.editar = set.has('Editar');
  user.apagar = set.has('Apagar');
  user.segregar = set.has('Segregar');
}

function validateUserData(data, isUpdate=false){
  const must = ['nome','cpf','funcao'];
  if (!isUpdate) must.push('senha');

  for (const f of must){
    if (!data || data[f] == null || String(data[f]).trim() === ''){
      return { valid:false, error:`Campo obrigatório: ${f}` };
    }
  }

  if (data.nome && (!String(data.nome).includes(' ') || /\d/.test(String(data.nome)))) {
    return { valid:false, error:'Nome inválido. Use nome e sobrenome, sem números.' };
  }
  if (data.email && !/^[\w.-]+@([\w-]+\.)+[\w-]{2,}$/i.test(data.email)) {
    return { valid:false, error:'E-mail inválido.' };
  }
  if (data.whatsapp){
    const w = normalizeCPF(data.whatsapp);
    if (w.length < 10 || w.length > 11) return { valid:false, error:'WhatsApp inválido.' };
  }
  if (data.cpf && !validaCPF(data.cpf)) return { valid:false, error:'CPF inválido.' };

  if (data.senha && (!/^\d{6}$/.test(String(data.senha)))) {
    return { valid:false, error:'A senha deve ter 6 dígitos numéricos.' };
  }
  const fun = String(data.funcao||'').toLowerCase();
  const validFun = ['usuário','funcionário','administrador','usuario','funcionario'];
  if (!validFun.includes(fun) && fun!=='superadministrador') {
    return { valid:false, error:'Função inválida.' };
  }
  return { valid:true };
}

function validaCPF(c){
  const s = String(c||'').replace(/\D/g,'');
  if (s.length!==11 || /^([0-9])\1+$/.test(s)) return false;
  let soma=0; for(let i=0;i<9;i++)  soma+=parseInt(s[i])*(10-i);
  let d1 = 11-(soma%11); if (d1>9) d1=0; if (d1!==parseInt(s[9]))  return false;
  soma=0; for(let i=0;i<10;i++) soma+=parseInt(s[i])*(11-i);
  let d2 = 11-(soma%11); if (d2>9) d2=0; return d2===parseInt(s[10]);
}

// normaliza acessos em array de strings únicas (ex.: ["A","B"])
function normalizeAcessos(a){
  if (!a) return undefined;
  const arr = Array.isArray(a) ? a : [a];
  const norm = arr.map(x=>String(x||'').trim()).filter(Boolean);
  return [...new Set(norm)];
}

function isUUID(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
}

// =============== CORS / JSON ===============

function json(obj, status=200, request){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request)
    }
  });
}

function handleCors(request){
  const headers = corsHeaders(request);
  headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
  return new Response(null, { headers });
}

function corsHeaders(request){
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// =============== UIID helpers ===============
function getUIID(env){ return (env && (env.KV_UIID || env.UIID)) || null; }
async function findUIIDKeyByCPF(env, cpf){
  const store = getUIID(env);
  if (!store || typeof store.list !== 'function') return null;
  const norm = String(cpf||'').replace(/\D/g,'').slice(0,11);
  try{
    let cursor = undefined;
    do{
      const page = await store.list({ cursor });
      for (const k of (page.keys || [])){
        try{
          const raw = await store.get(k.name);
          if (!raw) continue;
          const obj = JSON.parse(raw);
          const c = String(obj && obj.cpf || '').replace(/\D/g,'').slice(0,11);
          if (c === norm) return k.name;
        }catch{}
      }
      cursor = page.list_complete ? undefined : page.cursor;
    }while(cursor);
  }catch{}
  return null;
}
// =============== STORAGE ===============

async function getUser(kv, cpf){
  const norm = normalizeCPF(cpf);
  const raw = await kv.get(norm);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}





