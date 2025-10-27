// app.js - lÃ³gica unificada (login + painel + notificaÃ§Ãµes)
(function(){
  let currentUser = null;
  const API_BASE_URL = 'https://sistema.aruanda.workers.dev';

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  // Notificador (toast) leve (CSS estÃ¡ em theme.css)
  (function(){
    const DEFAULT_DURATION = 7000;
    function ensureContainer(){
      let c = document.querySelector('.notify-container');
      if(!c){ c = document.createElement('div'); c.className = 'notify-container'; document.body.appendChild(c); }
      return c;
    }
    function svgIcon(type){
      const color = type==='sucesso' ? '#10b981' : type==='erro' ? '#ef4444' : '#60a5fa';
      return `<svg class="notify__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2" fill="none"/>
        ${type==='sucesso' ? '<path d="M8 12l2.5 2.5L16 9" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' : ''}
        ${type==='erro' ? '<path d="M8 8l8 8M16 8l-8 8" stroke="#ef4444" stroke-width="2" stroke-linecap="round" />' : ''}
        ${type==='informacao' ? '<path d="M12 7.5h.01M11 10.5h2v6h-2z" fill="#60a5fa" />' : ''}
      </svg>`;
    }
    function createNotification(opts){
      const { message, type, duration } = opts;
      const el = document.createElement('div');
      el.className = `notify notify--${type}`;
      const bar = document.createElement('div'); bar.className = 'notify__progress'; el.appendChild(bar);
      const body = document.createElement('div'); body.className = 'notify__body';
      body.innerHTML = `${svgIcon(type)}<div class="notify__content"><div class="notify__text">${message}</div></div>`;
      el.appendChild(body);
      let running = true; let rafId = 0; const total = duration; let remaining = total; let last = performance.now();
      bar.style.transform = 'scaleX(1)';
      function step(now){
        if(running){ const delta = now - last; remaining = Math.max(0, remaining - delta); const frac = remaining / total; bar.style.transform = `scaleX(${frac})`; if(remaining <= 0){ remove(false); return; } }
        last = now; rafId = requestAnimationFrame(step);
      }
      function pause(){ if(running){ running = false; } }
      function resume(){ if(!running){ running = true; last = performance.now(); } }
      el.addEventListener('mouseenter', pause);
      el.addEventListener('mouseleave', resume);
      el.addEventListener('touchstart', function(e){ pause(); e.stopPropagation(); }, {passive:true});
      el.addEventListener('touchend', function(){ resume(); }, {passive:true});
      const remove = (manual)=>{ cancelAnimationFrame(rafId); el.classList.add('is-leaving'); const onEnd = ()=>{ el.removeEventListener('animationend', onEnd); el.remove(); if(typeof opts.onClose === 'function') opts.onClose({ manual }); }; el.addEventListener('animationend', onEnd); setTimeout(onEnd, 500); };
      rafId = requestAnimationFrame(step);
      return el;
    }
    function notify(message, options){
      const opts = Object.assign({ type: 'informacao', duration: DEFAULT_DURATION }, typeof options === 'object' ? options : {});
      opts.message = message;
      const container = ensureContainer();
      const el = createNotification(opts);
      container.appendChild(el);
      return el;
    }
    window.Notifier = { notify };
    window.notify = notify;
  })();

  // UtilitÃ¡rios compartilhados
  function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
  function setInvalid(inputEl, invalid){ const wrap = inputEl && inputEl.closest('.input, .input-with-btn, .input.password'); if(!wrap) return; wrap.classList.toggle('invalido', !!invalid); if(invalid){ wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); } }

  // LÃ³gica da pÃ¡gina de login
  ready(function(){
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const form = document.getElementById('login-form');
    const cpfInput = document.getElementById('cpf');
    const senhaInput = document.getElementById('senha');
    const toggleBtn = document.getElementById('toggleSenha'); if(toggleBtn){ const senha = document.getElementById('senha'); const setLoginLabel = ()=>{ const isPwd = senha && senha.type === 'password'; toggleBtn.textContent = isPwd ? 'Mostrar' : 'Ocultar'; toggleBtn.setAttribute('aria-pressed', String(!isPwd)); }; setLoginLabel(); toggleBtn.addEventListener('click', ()=>{ if(!senha) return; senha.type = senha.type === 'password' ? 'text' : 'password'; setLoginLabel(); }); }
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    if (cpfInput){ cpfInput.setAttribute('inputmode','numeric'); cpfInput.setAttribute('maxlength','14'); cpfInput.addEventListener('input', function(){ setInvalid(cpfInput,false); const d = digitsOnly(cpfInput.value).slice(0,11); let out=''; if(d.length>0) out = d.slice(0,3); if(d.length>=4) out += '.'+d.slice(3,6); if(d.length>=7) out += '.'+d.slice(6,9); if(d.length>=10) out += '-'+d.slice(9,11); cpfInput.value = out; }); }
    if (senhaInput){ senhaInput.setAttribute('inputmode','numeric'); senhaInput.setAttribute('maxlength','6'); senhaInput.addEventListener('input', function(){ setInvalid(senhaInput,false); senhaInput.value = digitsOnly(senhaInput.value).slice(0,6); }); }
    if (toggleBtn && senhaInput){ toggleBtn.addEventListener('click', function(){ const show = senhaInput.type === 'password'; senhaInput.type = show ? 'text' : 'password'; toggleBtn.classList.toggle('ligado', show); toggleBtn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); }); }

    function setLoading(loading){ const btn = submitBtn || (form && form.querySelector('button[type="submit"]')); if(!btn) return; btn.classList.toggle('carregando', !!loading); btn.disabled = !!loading; if(loading){ if(!btn.dataset.original) btn.dataset.original = btn.textContent || 'Entrar'; btn.textContent = 'Entrando...'; } else { btn.textContent = btn.dataset.original || 'Entrar'; } }

    if (form){
      form.addEventListener('submit', async function(e){
        e.preventDefault(); setInvalid(cpfInput,false); setInvalid(senhaInput,false);
        const cpfDigits = cpfInput ? digitsOnly(cpfInput.value) : ''; const senha = senhaInput ? digitsOnly(senhaInput.value).slice(0,6) : '';
        if (!cpfDigits && !senha) { try{ notify('Insira os dados', { type: 'informacao', title: 'AtenÃ§Ã£o' }); }catch(e){}; setInvalid(cpfInput,true); setInvalid(senhaInput,true); return; }
        if (!cpfDigits) { try{ notify('Informe o CPF', { type: 'erro', title: 'CPF' }); }catch(e){}; setInvalid(cpfInput,true); return; }
        if (!senha) { try{ notify('Informe a senha', { type: 'erro', title: 'Senha' }); }catch(e){}; setInvalid(senhaInput,true); return; }
        if (cpfDigits.length !== 11 || senha.length !== 6) {
          if (cpfDigits.length !== 11) { setInvalid(cpfInput,true); try{ notify('CPF incorreto', { type: 'erro', title: 'CPF' }); }catch(e){} }
          if (senha.length !== 6) { setInvalid(senhaInput,true); try{ notify('Senha incorreta', { type: 'erro', title: 'Senha' }); }catch(e){} }
          return;
        }
        setLoading(true); let loadingToast = null; try{ loadingToast = notify('Validando credenciais...', { type: 'informacao', title: 'Entrando', duration: 6000 }); }catch(e){}
        try{
          const resp = await fetch(`${API_BASE_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: cpfDigits, senha }) });
          const data = await resp.json();

          if(resp.ok && data.ok) {
            currentUser = data.user;
            renderDashboard(currentUser);
            document.body.classList.remove('login');
            document.body.classList.add('dashboard');
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';
            return;
          }
          
          const errorMessage = data.error || 'Dados incorretos.';
          setInvalid(cpfInput,true); setInvalid(senhaInput,true); try{ notify(errorMessage, { type: 'erro', title: 'Falha no login' }); }catch(e){}

        }catch(err){ setInvalid(senhaInput,true); try{ notify('Erro ao conectar ao servidor.', { type: 'erro', title: 'ConexÃ£o' }); }catch(e){} }
        finally{ setLoading(false); try { if(loadingToast && loadingToast.remove) loadingToast.remove(); } catch(e){} }
      });
    }
  });

  // LÃ³gica da pÃ¡gina do painel
  ready(function(){
    const tabs = document.querySelectorAll('.tab');
    const sections = {
      moradores: document.getElementById('section-moradores'),
      novo: document.getElementById('section-novo'),
      credenciais: document.getElementById('section-credenciais'),
      log: document.getElementById('section-log')
    };
    function showTab(id){ 
      Object.entries(sections).forEach(([k,el])=> el && (el.hidden = (k !== id))); 
      tabs.forEach(t=> t.classList.toggle('active', t.getAttribute('data-tab') === id));
      if (id === 'credenciais') {
        loadCredentials();
      }
    }
    if (tabs && tabs.length){ tabs.forEach(t=> t.addEventListener('click', ()=> showTab(t.getAttribute('data-tab')))); showTab('moradores'); }

    const clock = document.getElementById('clock');
    function pad(n){return String(n).padStart(2,'0')} function tick(){ if(clock){ const d = new Date(); clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; } }
    if (clock){ setInterval(tick, 1000); tick(); }

    const logout = document.getElementById('logout'); 
    if (logout) {
      logout.addEventListener('click', () => { 
        currentUser = null;
        document.body.classList.remove('dashboard');
        document.body.classList.add('login');
        document.getElementById('dashboard-section').style.display = 'none'; 
        document.getElementById('login-section').style.display = 'block'; 
      });
    }

    
    // Sync chips with checkboxes in Credenciais
    document.querySelectorAll('#section-credenciais .toggle-chip').forEach(function(chip){
      const id = chip.getAttribute('data-toggle-for');
      const input = document.getElementById(id);
      if(!input) return;
      // Init state
      chip.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
      // Click -> toggle
      chip.addEventListener('click', function(){
        const now = chip.getAttribute('aria-pressed') === 'true';
        const next = !now;
        chip.setAttribute('aria-pressed', next ? 'true' : 'false');
        input.checked = next;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // If checkbox toggled programmatically, reflect on chip
      input.addEventListener('change', function(){
        chip.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
      });
    });
    const credentialsState = {
      users: [],
      editingCpf: null,
    };

    const credForm = document.querySelector('#section-credenciais .grid');
    const credNome = document.getElementById('cred-nome');
    const credEmail = document.getElementById('cred-email');
    const credWhats = document.getElementById('cred-whats');
    const credNasc = document.getElementById('cred-nasc');
    const credCpf = document.getElementById('cred-cpf');
    const credSenha = document.getElementById('cred-senha');
    const credTag = null;
    const credTagCopyBtn = null;
    const credFuncao = credForm ? credForm.querySelector('select') : null;
    const credPermissoes = credForm ? credForm.querySelectorAll('.checks[aria-label="PermissÃµes"] input[type="checkbox"]') : [];
    const credAcessos = credForm ? credForm.querySelectorAll('.checks[aria-label="Acesso"] input[type="checkbox"]') : [];
    const credSubmitBtn = document.getElementById('cred-submit');
    const credCancelBtn = document.getElementById('cred-cancel');
    const credTableBody = document.querySelector('#section-credenciais .table tbody');
    // Helper para obter checkboxes de Permissões de forma resiliente
    function getPermChecks(){
      if (!credForm) return [];
      let n = credForm.querySelectorAll('.checks[aria-label="Permissões"] input[type="checkbox"]');
      if (!n || !n.length) n = credForm.querySelectorAll('.checks[aria-label^="Permiss"] input[type="checkbox"]');
      if (!n || !n.length) n = ['p_criar','p_editar','p_apagar','p_segregar'].map(id=>document.getElementById(id)).filter(Boolean);
      return n;
    }

    async function loadCredentials() {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/credentials`, { method: 'GET' });
        const data = await resp.json();
        if (resp.ok && data.ok) {
          credentialsState.users = data.users;
          renderCredentials();
        } else {
          notify(data.error || 'Falha ao carregar credenciais', { type: 'erro' });
        }
      } catch (err) {
        notify('Erro de rede ao carregar credenciais', { type: 'erro' });
      }
    }

    function renderCredentials() {
      if (!credTableBody) return;

      credTableBody.innerHTML = '';
      credentialsState.users.forEach(user => {
        const permissions = getPermissionsHTML(user.permissao || []);
        const isBlocked = user.bloqueado === 'sim';
        const lockColor = isBlocked ? '#ef4444' : '#10b981';
        const lockTitle = isBlocked ? 'Bloqueado' : 'Ativo';
        const lockPath = isBlocked
          ? '<path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />'
          : '<path d="M7 10V7a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />';
        const statusIcon = `
          <svg class="status-lock" viewBox="0 0 24 24" width="20" height="20" aria-label="${lockTitle}" role="img" style="color: ${lockColor}">
            ${lockPath}
            <rect x="5" y="10" width="14" height="10" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        `; const regIcon = ((String(user.tag||'').trim().toLowerCase()) === 'cadastrado') ? '<svg class=\"reg-mark\" viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" aria-label=\"Cadastrada\" role=\"img\" style=\"color:#10b981\"><path d=\"M20 6L9 17l-5-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>' : '<svg class=\"reg-mark\" viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" aria-label=\"Não cadastrada\" role=\"img\" style=\"color:#ef4444\"><path d=\"M6 6l12 12M18 6L6 18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${maskCPF(user.cpf)}</td>
          <td>${user.nome}</td>
          <td>${(user.funcao||'').toUpperCase()}</td>
          <td><span class="tag-code" title=\\\"UIID\\\">${user.uiid || user['tag-code'] || user.uuid || user.id || ''}</span> ${((user.uiid || user['tag-code'] || user.uuid || user.id) && (String(user.tag||'').trim().toLowerCase()) !== 'cadastrado') ? '<button class="chip" data-action="copy-tag" data-cpf="'+user.cpf+'">Copiar</button>' : ''}</td>
          <td><div class="permissions-container">${permissions}</div></td>
          <td>${statusIcon} ${regIcon}</td>
          <td>
            <button class="chip" data-action="edit" data-cpf="${user.cpf}">Editar</button>
            <button class="chip" data-action="block" data-cpf="${user.cpf}">${user.bloqueado === 'sim' ? 'Desbloquear' : 'Bloquear'}</button>
            <button class="chip" data-action="delete" data-cpf="${user.cpf}">Remover</button>
          </td>
        `;
        credTableBody.appendChild(row);
      });
    }

    function getPermissionsHTML(permissions) {
      const permissionMap = {
        'Criar': 'create',
        'Editar': 'edit',
        'Apagar': 'delete',
        'Segregar': 'segregate'
      };

      let html = '';
      for (const [permission, className] of Object.entries(permissionMap)) {
        const allowed = permissions.includes(permission);
        html += `<span class="permission-icon ${className} ${allowed ? 'allowed' : 'denied'}" title="${permission}"></span>`;
      }
      return html;
    }

    function resetCredentialForm() {
      credentialsState.editingCpf = null;
      credNome.value = '';
      credEmail.value = '';
      credWhats.value = '';
      credNasc.value = '';
      credCpf.value = '';
      credSenha.value = '';
      
      credFuncao.selectedIndex = 0;
      Array.from(getPermChecks()).forEach(c => c.checked = false);
      credAcessos.forEach(c => c.checked = false);
      credCpf.disabled = false;
      if (credSubmitBtn) {
        credSubmitBtn.textContent = 'Criar';
      }
      if (credCancelBtn) {
        credCancelBtn.style.display = 'none';
      }
    }

    function fillCredentialForm(cpf) {
      const user = credentialsState.users.find(u => u.cpf === cpf);
      if (!user) return;

      credentialsState.editingCpf = cpf;
      credNome.value = user.nome || '';
      credEmail.value = user.email || '';
      credWhats.value = user.whatsapp ? maskWhats(user.whatsapp) : '';
      credNasc.value = user.dataNascimento ? maskDate(user.dataNascimento) : '';
      credCpf.value = maskCPF(user.cpf);
      credCpf.disabled = true;
      credSenha.value = ''; // Never show the password
      
      credFuncao.value = user.funcao;

      Array.from(getPermChecks()).forEach(c => {
        c.checked = (user.permissao || []).includes(c.nextElementSibling.textContent);
      });
      credAcessos.forEach(c => {
        const accessId = c.id.split('_')[1];
        c.checked = (user.acessos || []).includes(accessId);
      });

      if (credSubmitBtn) {
        credSubmitBtn.textContent = 'Salvar AlteraÃ§Ãµes';
      }
      if (credCancelBtn) {
        credCancelBtn.style.display = 'inline-block';
      }
      credNome.focus();
    }

    if (credSubmitBtn) {
      credSubmitBtn.addEventListener('click', async () => {
        const isEditing = !!credentialsState.editingCpf;

        // --- Validation ---
        let formIsValid = true;
        const fieldsToValidate = [
            { el: credNome, errEl: 'cred-nome-err', msg: 'Insira o nome completo', rule: (v) => !v || v.trim().split(/\s+/).length >= 2 },
            { el: credEmail, errEl: 'cred-email-err', msg: 'E-mail invÃ¡lido', rule: (v) => !v || isEmail(v) },
            { el: credWhats, errEl: 'cred-whats-err', msg: 'Insira um WhatsApp vÃ¡lido', rule: (v) => !v || (digitsOnly(v).length >= 10 && digitsOnly(v).length <= 11) },
            { el: credNasc, errEl: 'cred-nasc-err', msg: 'Data invÃ¡lida. O ano deve ser a partir de 1920.', rule: (v) => { const dt = parseDateBR(v); return !v || (dt && dt.getFullYear() >= 1920); } },
            { el: credCpf, errEl: 'cred-cpf-err', msg: 'CPF invÃ¡lido', rule: (v) => isEditing || validaCPF(v) },
            { el: credSenha, errEl: 'cred-senha-err', msg: 'A senha deve ter 6 dÃ­gitos.', rule: (v) => isEditing ? (!v || v.length === 6) : (v.length === 6) }
        ];
        
        fieldsToValidate.forEach(field => {
            if (!field.el) return;
            const value = field.el.value;
            const ok = field.rule(value);
            const e = err(field.errEl);
            setInvalid(field.el, !ok);
            if (e) e.textContent = ok ? '' : field.msg;
            if (!ok) formIsValid = false;
        });

        if (!formIsValid) {
            notify('Por favor, corrija os campos destacados.', { type: 'erro' });
            return;
        }
        // --- End Validation ---

        const cpf = isEditing ? credentialsState.editingCpf : digitsOnly(credCpf.value);

        function generateTag() {
          const now = new Date();
          const pad = (n)=> String(n).padStart(2,'0');
          const timePart = `${pad(now.getHours())}:${pad(now.getMinutes())}.${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()}`;
          let rnd = '';
          for (let i=0;i<8;i++) rnd += Math.floor(Math.random()*10);
          return `${timePart}.${rnd}`;
        }

        // Gera UIID (UUID v4)
        function generateUUID() {
          if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
          }
          const bytes = new Uint8Array(16);
          if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
          } else {
            for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
          }
          bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
          bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
          const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
          return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
        }

        const existingUser = isEditing ? credentialsState.users.find(u => u.cpf === cpf) : null;

        const data = {
          nome: credNome.value,
          email: credEmail.value,
          whatsapp: digitsOnly(credWhats.value),
          dataNascimento: credNasc.value,
          cpf: cpf,
          senha: credSenha.value,
          funcao: credFuncao.value,
          permissao: Array.from(getPermChecks()).filter(c => c.checked).map(c => c.nextElementSibling.textContent),
          acessos: Array.from(credAcessos).filter(c => c.checked).map(c => c.id.split('_')[1]),
          bloqueado: isEditing ? credentialsState.users.find(u => u.cpf === cpf).bloqueado : 'nao',
          tag: isEditing ? undefined : generateTag(),
          uuid: isEditing ? (existingUser && (existingUser.uuid || existingUser.id)) : generateUUID(),
        };

        // Don't send empty password on update unless it's being changed
        if (isEditing && !data.senha) {
          delete data.senha;
        }

        const url = isEditing ? `${API_BASE_URL}/api/credentials/${cpf}` : `${API_BASE_URL}/api/credentials`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
          const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          const result = await resp.json();

          if (resp.ok && result.ok) {
            notify(`Credencial ${isEditing ? 'atualizada' : 'criada'} com sucesso!`, { type: 'sucesso' });
            resetCredentialForm();
            // Atualiza lista local imediatamente para exibir UIID retornado pela API
            try {
              if (result.user && result.user.cpf) {
                const cpfKey = String(result.user.cpf);
                const idx = credentialsState.users.findIndex(u => String(u.cpf) === cpfKey);
                if (idx >= 0) credentialsState.users.splice(idx, 1, result.user);
                else credentialsState.users.unshift(result.user);
                renderCredentials();
              }
            } catch {}
            // Em seguida, sincroniza com o servidor (eventual consistency do KV.list)
            setTimeout(loadCredentials, 300);
          } else {
            notify(result.error || `Falha ao ${isEditing ? 'atualizar' : 'criar'} credencial`, { type: 'erro' });
          }
        } catch (err) {
          notify('Erro de rede', { type: 'erro' });
        }
      });
    }

    if (credCancelBtn) {
      credCancelBtn.addEventListener('click', () => {
        resetCredentialForm();
      });
    }

    if (credTableBody) {
      credTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        if (!target.classList.contains('chip')) return;

        const action = target.dataset.action;
        const cpf = target.dataset.cpf;

        if (action === 'edit') {
          fillCredentialForm(cpf);
        } else if (action === 'delete') {
          if (confirm(`Tem certeza que deseja remover o usuÃ¡rio com CPF ${maskCPF(cpf)}?`)) {
            try {
              const resp = await fetch(`${API_BASE_URL}/api/credentials/${cpf}`, { method: 'DELETE' });
              const result = await resp.json();
              if (resp.ok && result.ok) {
                notify('UsuÃ¡rio removido com sucesso', { type: 'sucesso' });
                loadCredentials();
              } else {
                notify(result.error || 'Falha ao remover usuÃ¡rio', { type: 'erro' });
              }
            } catch (err) {
              notify('Erro de rede', { type: 'erro' });
            }
          }
        } else if (action === 'copy-tag') {
          const user = credentialsState.users.find(u => u.cpf === cpf);
          const value = user && (user.uiid || user['tag-code'] || user.uuid || user.id); if (!value) return;
          try {
            await navigator.clipboard.writeText(value);
            notify('CÃ³digo copiado', { type: 'sucesso' });
          } catch (e) {
            notify('Falha ao copiar', { type: 'erro' });
          }
        } else if (action === 'block') {
          const user = credentialsState.users.find(u => u.cpf === cpf);
          if (!user) return;

          const shouldBlock = user.bloqueado !== 'sim';
          if (confirm(`Tem certeza que deseja ${shouldBlock ? 'bloquear' : 'desbloquear'} o usuÃ¡rio ${user.nome}?`)) {
            const updatedUser = { ...user, bloqueado: shouldBlock ? 'sim' : 'nao' };
            try {
              const resp = await fetch(`${API_BASE_URL}/api/credentials/${cpf}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedUser) });
              const result = await resp.json();
              if (resp.ok && result.ok) {
                notify(`UsuÃ¡rio ${shouldBlock ? 'bloqueado' : 'desbloqueado'} com sucesso`, { type: 'sucesso' });
                loadCredentials();
              } else {
                notify(result.error || 'Falha ao atualizar usuÃ¡rio', { type: 'erro' });
              }
            } catch (err) {
              notify('Erro de rede', { type: 'erro' });
            }
          }
        }
      });
    }

    // Credenciais: mÃ¡scaras/validaÃ§Ã£o (jÃ¡ existentes)
    const err = (id)=> document.getElementById(id);
    if (credNome) {
      credNome.addEventListener('input', ()=> { credNome.value = (credNome.value || '').replace(/[\d]/g, ''); });
      credNome.addEventListener('blur', ()=> {
        const value = (credNome.value || '').trim();
        const ok = !value || value.split(' ').length >= 2;
        const e = err('cred-nome-err');
        if(e) e.textContent = ok ? '' : 'Insira o nome completo';
        setInvalid(credNome, !ok);
      });
    }
    function isEmail(v){ return /\S+@\S+\.\S+/.test(v); }
    if (credEmail) {
      credEmail.addEventListener('input', ()=> { credEmail.value = credEmail.value.toLowerCase(); });
      credEmail.addEventListener('blur', ()=> { const ok = !credEmail.value || isEmail(credEmail.value); const e = err('cred-email-err'); if(e) e.textContent = ok ? '' : 'E-mail invÃ¡lido'; setInvalid(credEmail, !ok); });
    }

    function maskWhats(v){ const d = String(v).replace(/\D/g,'').slice(0,11); const ddd = d.slice(0,2); const rest = d.slice(2); if (rest.length > 5) return `(${ddd}) ${rest.slice(0,5)}-${rest.slice(5,9)}`; if (rest.length > 4) return `(${ddd}) ${rest.slice(0,5)}-${rest.slice(5)}`; if (rest) return `(${ddd}) ${rest}`; return ddd ? `(${ddd}` : ''; }
    if (credWhats){ credWhats.addEventListener('input', ()=> { credWhats.value = maskWhats(credWhats.value); }); credWhats.addEventListener('blur', ()=> { const digits = credWhats.value.replace(/\D/g,''); const ok = !credWhats.value || digits.length === 10 || digits.length === 11; const e = err('cred-whats-err'); if(e) e.textContent = ok ? '' : 'Insira um WhatsApp vÃ¡lido'; setInvalid(credWhats, !ok); }); }

    function maskDate(v){ const d = v.replace(/\D/g,'').slice(0,8); if (d.length<=2) return d; if (d.length<=4) return d.slice(0,2)+'/'+d.slice(2); return d.slice(0,2)+'/'+d.slice(2,4)+'/'+d.slice(4); }
    function parseDateBR(s){ const m = /^([0-3]\d)\/([0-1]\d)\/(\d{4})$/.exec(s); if(!m) return null; const dd=+m[1], mm=+m[2]-1, yy=+m[3]; const dt = new Date(yy,mm,dd); if(dt.getFullYear()!==yy||dt.getMonth()!==mm||dt.getDate()!==dd) return null; return dt; }
    function age(dt){ const now=new Date(); let a=now.getFullYear()-dt.getFullYear(); const m=now.getMonth()-dt.getMonth(); if(m<0||(m===0&&now.getDate()<dt.getDate())) a--; return a; }
    if (credNasc){ credNasc.addEventListener('input', ()=> { credNasc.value = maskDate(credNasc.value); }); credNasc.addEventListener('blur', ()=> { const dt = parseDateBR(credNasc.value); const ok = !credNasc.value || (dt && dt.getFullYear() >= 1920 && age(dt) <= 110); const e = err('cred-nasc-err'); if(e) e.textContent = ok ? '' : 'Data invÃ¡lida. O ano deve ser a partir de 1920.'; setInvalid(credNasc, !ok); }); }

    function maskCPF(v){ const d=(v||'').replace(/\D/g,'').slice(0,11); return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }
    function validaCPF(c){ const s = (c||'').replace(/\D/g,''); if(s.length!==11||/^([0-9])\1+$/.test(s)) return false; let soma=0; for(let i=0;i<9;i++) soma+=parseInt(s.charAt(i))*(10-i); let d1=11-(soma%11); if(d1>9) d1=0; if(d1!=parseInt(s.charAt(9))) return false; soma=0; for(let i=0;i<10;i++) soma+=parseInt(s.charAt(i))*(11-i); let d2=11-(soma%11); if(d2>9) d2=0; return d2==parseInt(s.charAt(10)); }
    if (credCpf){ credCpf.addEventListener('input', ()=> { credCpf.value = maskCPF(credCpf.value); }); credCpf.addEventListener('blur', ()=> { const ok = !credCpf.value || validaCPF(credCpf.value); const e = err('cred-cpf-err'); if(e) e.textContent = ok ? '' : 'CPF invÃ¡lido'; setInvalid(credCpf, !ok); }); }

    if (credSenha){ credSenha.setAttribute('inputmode','numeric'); credSenha.setAttribute('maxlength','6'); credSenha.addEventListener('input', ()=> { credSenha.value = (credSenha.value||'').replace(/\D/g,'').slice(0,6); }); const btn = document.getElementById('toggle-cred-senha'); if(btn){ const setLabel = ()=>{ const isPwd = credSenha.type === 'password'; btn.textContent = isPwd ? 'Mostrar' : 'Ocultar'; btn.setAttribute('aria-pressed', String(!isPwd)); }; setLabel(); btn.addEventListener('click', ()=>{ const isPwd = credSenha.type === 'password'; credSenha.type = isPwd ? 'text' : 'password'; setLabel(); }); } }
  });

  function renderDashboard(user) {
    if (!user) return;

    // For now, just populate the residents table with the logged in user
    const moradoresTableBody = document.querySelector('#section-moradores .table tbody');
    if (moradoresTableBody) {
      // format CPF
      const formattedCpf = user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      
      // For now, Bloco and Apart. are not in the user object, so I'll leave them empty
      moradoresTableBody.innerHTML = `
        <tr>
          <td>${formattedCpf}</td>
          <td>${user.nome}</td>
          <td>-</td>
          <td>-</td>
          <td><span class="status">${user.bloqueado === 'nao' ? 'ATIVO' : 'BLOQUEADO'}</span></td>
        </tr>
      `;
    }
  }
})();



// Toggle senha (login)
(function(){
  const senha = document.getElementById('senha');
  const btn = document.getElementById('toggleSenha');
  if(!senha || !btn) return;
  const setLabel = ()=>{
    const isPwd = senha.type === 'password';
    btn.textContent = isPwd ? 'Mostrar' : 'Ocultar';
    btn.setAttribute('aria-label', isPwd ? 'Mostrar senha' : 'Ocultar senha');
    btn.setAttribute('aria-pressed', String(!isPwd));
  };
  setLabel();
  btn.addEventListener('click', ()=>{
    senha.type = senha.type === 'password' ? 'text' : 'password';
    setLabel();
  });
})();
    











