﻿// =============================================
// SCRIPTS.JS - DESIGN SYSTEM COMPLETO (CORRIGIDO)
// Máscaras, validações e formatação
// =============================================

// =============================================
// MÁSCARA CPF: 000.000.000-00
// =============================================
document.querySelectorAll('.mask-cpf').forEach(input => {
  input.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);

    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');

    e.target.value = v;
  });
});

// =============================================
// MÁSCARA CELULAR: (11) 9 9999-9999 OU (11) 9999-9999
// Aceita 10 ou 11 dígitos. Validação do DDD e do 9º dígito
// =============================================
document.querySelectorAll('.mask-celular').forEach(input => {
  input.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);

    if (v.length <= 10) {
      // Formato sem nono dígito: (11) 1111-1111
      v = v.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, function(_, ddd, p1, p2) {
        let out = '';
        if (ddd) out += `(${ddd}`;
        if (ddd.length === 2) out += ') ';
        if (p1) out += p1;
        if (p1.length === 4 && p2) out += '-' + p2;
        return out;
      });
    } else {
      // Formato com nono dígito: (11) 9 1111-1111
      v = v.replace(/^(\d{0,2})(\d{0,1})(\d{0,4})(\d{0,4}).*/, function(_, ddd, d9, p1, p2) {
        let out = '';
        if (ddd) out += `(${ddd}`;
        if (ddd.length === 2) out += ') ';
        if (d9) out += d9 + ' ';
        if (p1) out += p1;
        if (p1.length === 4 && p2) out += '-' + p2;
        return out;
      });
    }

    e.target.value = v;
  });

  input.addEventListener('blur', (e) => {
    const num = e.target.value.replace(/\D/g, '');
    const erro = e.target.closest('.field')?.querySelector('.error') || { textContent: '' };
    const campo = e.target.closest('.input');

    const valido = (num.length === 10 || num.length === 11) && num[2] >= '1' && num[2] <= '9';
    
    if (valido) {
      erro.textContent = '';
      campo.classList.remove('invalido');
    } else if (num.length > 0) {
      erro.textContent = 'Celular inválido';
      campo.classList.add('invalido');
    }
  });
});

// =============================================
// NOME COMPLETO: Permite múltiplos espaços (CORRIGIDO!)
// =============================================
document.getElementById('nome')?.addEventListener('input', (e) => {
  let valor = e.target.value;

  // Permite apenas letras, acentos e espaços (múltiplos)
  valor = valor.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');

  const terminaComEspaco = /\s$/.test(valor);

  // Divide por espaços, mas mantém múltiplos espaços como um só
  const palavras = valor.split(/\s+/).filter(p => p.length > 0);
  const excecoes = ['de', 'da', 'do', 'dos', 'e', 'di', 'del', 'von'];

  const formatado = palavras.map((palavra) => {
    return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
  }).join(' ');

  e.target.value = terminaComEspaco ? (formatado + ' ') : formatado;
});

// =============================================
// SENHA: 6 DÍGITOS NUMÉRICOS
// =============================================
document.getElementById('senha')?.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '');
  if (v.length > 6) v = v.slice(0, 6);
  e.target.value = v;
});

// =============================================
// EMAIL: MINÚSCULAS + VALIDAÇÃO
// =============================================
document.getElementById('email')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.toLowerCase().trim();
});

// =============================================
// CAMPO DATA: Impede datas futuras e absurdas
// =============================================
document.getElementById('data-nascimento')?.addEventListener('change', (e) => {
  const val = e.target.value;
  const campo = e.target.closest('.input');
  const erro = e.target.closest('.field')?.querySelector('.error') || { textContent: '' };

  if (!val) return;

  const hoje = new Date();
  const selecionada = new Date(val);

  if (selecionada > hoje || selecionada.getFullYear() < 1900) {
    erro.textContent = 'Data inválida';
    campo.classList.add('invalido');
  } else {
    erro.textContent = '';
    campo.classList.remove('invalido');
  }
});

// =============================================
// CEP: 00000-000 (opcional, mas se preencher valida)
// =============================================
document.getElementById('cep')?.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '');
  if (v.length > 8) v = v.slice(0, 8);
  v = v.replace(/(\d{5})(\d)/, '$1-$2');
  e.target.value = v;
});

document.getElementById('cep')?.addEventListener('blur', (e) => {
  const cep = e.target.value.replace(/\D/g, '');
  const campo = e.target.closest('.input');
  const erro = e.target.closest('.field')?.querySelector('.error') || { textContent: '' };

  if (cep.length === 0) {
    erro.textContent = '';
    campo.classList.remove('invalido');
    return;
  }

  if (cep.length !== 8) {
    erro.textContent = 'CEP inválido';
    campo.classList.add('invalido');
  } else {
    erro.textContent = '';
    campo.classList.remove('invalido');
  }
});

// =============================================
// CPF: validação completa
// =============================================
document.getElementById('cpf')?.addEventListener('blur', (e) => {
  const cpf = e.target.value.replace(/\D/g, '');
  const campo = e.target.closest('.input');
  const erro = e.target.closest('.field')?.querySelector('.error') || { textContent: '' };

  function validarCPF(cpf) {
    if (!cpf || cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;

    let soma = 0, resto;

    for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[9])) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[10])) return false;

    return true;
  }

  if (!validarCPF(cpf)) {
    erro.textContent = 'CPF inválido';
    campo.classList.add('invalido');
  } else {
    erro.textContent = '';
    campo.classList.remove('invalido');
  }
});

// =============================================
// BOTÃO SUBMIT: exemplo de coleta de dados
// =============================================
document.getElementById('btn-enviar')?.addEventListener('click', (e) => {
  e.preventDefault();

  const dados = {
    nome: document.getElementById('nome')?.value.trim() || '',
    email: document.getElementById('email')?.value.trim() || '',
    celular: document.getElementById('celular')?.value.trim() || '',
    cpf: document.getElementById('cpf')?.value.trim() || '',
    dataNascimento: document.getElementById('data-nascimento')?.value.trim() || '',
    cep: document.getElementById('cep')?.value.trim() || '',
  };

  console.log('Dados do formulário:', dados);

  // Aqui você seguiria com envio via fetch/AJAX etc.
});

// =============================================
// ACESSIBILIDADE: foco, aria e feedback mínimo
// =============================================
document.querySelectorAll('.input input').forEach(inp => {
  inp.addEventListener('focus', () => {
    inp.closest('.input')?.classList.add('focus');
  });
  inp.addEventListener('blur', () => {
    inp.closest('.input')?.classList.remove('focus');
  });
});

// =============================================
// UTIL: travar entrada numérica em campos específicos
// (exemplo de como restringir teclas)
// =============================================
document.querySelectorAll('.numeric-only').forEach(inp => {
  inp.addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });
});

// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('Sistema carregado!');

  const dataInput = document.getElementById('data-nascimento');
  if (dataInput) {
    const hoje = new Date();
    dataInput.max = hoje.toISOString().split('T')[0];
    dataInput.min = '1900-01-01';
  }
});
