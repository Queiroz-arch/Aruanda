/**
 * Cloudflare Worker para Autenticação de Login (v3 - Robusto)
 *
 * Melhorias:
 * - Rate Limiting por IP para previnir brute-force (requer KV namespace `RATE_LIMIT_KV`).
 * - Validação de entrada mais estrita (tamanho de CPF e senha).
 * - Headers de segurança em todas as respostas.
 * - Código mais modular e organizado.
 */

// --- Configurações ---
const RATE_LIMIT_CONFIG = {
  ATTEMPTS: 5, // Máximo de tentativas falhas
  WINDOW_MINUTES: 15, // Janela de tempo em minutos
  BLOCK_MINUTES: 30, // Duração do bloqueio em minutos
};

// --- Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Em produção, use seu domínio: e.g., 'https://seu-site.com'
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; object-src 'none'; script-src 'none'; style-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// --- Funções Auxiliares ---

/**
 * Retorna uma resposta JSON com os headers corretos.
 */
function jsonResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders,
    ...securityHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Verifica e aplica o rate limiting para um dado IP.
 * @returns {Response | null} Retorna uma resposta de erro se o IP estiver bloqueado, senão null.
 */
async function checkRateLimit(env, ip) {
  const key = `ip:${ip}`;
  const now = Date.now();
  let record = await env.RATE_LIMIT_KV.get(key, { type: 'json' });

  if (record) {
    // Verifica se o bloqueio ainda está ativo
    if (record.blockedUntil && record.blockedUntil > now) {
      return jsonResponse({ error: 'Muitas tentativas de login. Tente novamente mais tarde.' }, 429);
    }

    // Reseta o registro se a janela de tempo já passou
    const windowStart = now - RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60 * 1000;
    if (record.firstAttempt < windowStart) {
      record = null; // Considera como um novo registro
    }
  }

  return null; // Não está bloqueado
}

/**
 * Registra uma tentativa de login falha para o rate limiting.
 */
async function recordFailedAttempt(env, ip) {
  const key = `ip:${ip}`;
  const now = Date.now();
  let record = (await env.RATE_LIMIT_KV.get(key, { type: 'json' })) || {
    attempts: 0,
    firstAttempt: now,
  };

  record.attempts++;

  if (record.attempts >= RATE_LIMIT_CONFIG.ATTEMPTS) {
    record.blockedUntil = now + RATE_LIMIT_CONFIG.BLOCK_MINUTES * 60 * 1000;
    // TTL para a chave expirar após o fim do bloqueio + 1 dia
    const expirationTtl = (RATE_LIMIT_CONFIG.BLOCK_MINUTES + 1440) * 60;
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), { expirationTtl });
  } else {
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(record));
  }
}

// --- Lógica Principal ---

async function handleLoginRequest(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  // 1. Verifica o Rate Limiting antes de qualquer outra coisa
  const rateLimitResponse = await checkRateLimit(env, ip);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // 2. Valida o corpo da requisição
  if (request.headers.get('Content-Type') !== 'application/json') {
    return jsonResponse({ error: 'Content-Type deve ser application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Corpo da requisição JSON inválido.' }, 400);
  }

  // 3. Validação estrita dos dados de entrada
  const { cpf, senha } = body;
  const sanitizedCpf = cpf ? String(cpf).replace(/[^0-9]/g, '') : '';
  const sanitizedSenha = senha ? String(senha).replace(/[^0-9]/g, '') : '';

  if (sanitizedCpf.length !== 11 || sanitizedSenha.length !== 6) {
    await recordFailedAttempt(env, ip); // Penaliza tentativa com dados mal formatados
    return jsonResponse({ error: 'Formato de CPF ou senha inválido.' }, 400);
  }

  // 4. Consulta ao KV e autenticação
  const userDataString = await env.KV_CREDENCIAIS.get(sanitizedCpf);
  if (!userDataString) {
    await recordFailedAttempt(env, ip);
    return jsonResponse({ error: 'CPF ou senha inválidos.' }, 401);
  }

  const userData = JSON.parse(userDataString);

  if (userData.bloqueado && userData.bloqueado.toLowerCase() !== 'nao') {
    return jsonResponse({ error: 'Este usuário está bloqueado.' }, 403);
  }

  if (userData.senha !== sanitizedSenha) {
    await recordFailedAttempt(env, ip);
    return jsonResponse({ error: 'CPF ou senha inválidos.' }, 401);
  }

  // 5. Sucesso na autenticação
  const { senha: _, ...userToReturn } = userData;
  return jsonResponse({ message: 'Login bem-sucedido!', user: userToReturn }, 200);
}

// --- Entrypoint do Worker ---

addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'OPTIONS') {
    return event.respondWith(new Response(null, { headers: corsHeaders }));
  }

  if (request.method === 'POST') {
    return event.respondWith(handleLoginRequest(request, event.env).catch((error) => {
      console.error('Erro inesperado no worker:', error);
      return jsonResponse({ error: 'Ocorreu um erro interno no servidor.' }, 500);
    }));
  }

  return event.respondWith(
    new Response(null, { status: 405, statusText: 'Method Not Allowed' })
  );
});
