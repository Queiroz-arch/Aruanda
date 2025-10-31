document.addEventListener('DOMContentLoaded', () => {

  // --- MOSTRAR/OCULTAR SENHA ---
  const toggleSenha = document.getElementById('toggle-senha');
  const senhaInput = document.getElementById('senha');
  const iconEye = document.getElementById('icon-eye');
  const iconEyeOff = document.getElementById('icon-eye-off');

  if (toggleSenha && senhaInput) {
    toggleSenha.addEventListener('click', () => {
      if (senhaInput.type === 'password') {
        senhaInput.type = 'text';
        iconEye.style.display = 'none';
        iconEyeOff.style.display = 'inline-block';
      } else {
        senhaInput.type = 'password';
        iconEye.style.display = 'inline-block';
        iconEyeOff.style.display = 'none';
      }
    });
  }

  // --- ESTADO DE CARREGAMENTO DO BOTÃO ---
  const loginForm = document.getElementById('login-form');
  const loginButton = document.getElementById('btn-login');
  const btnText = loginButton ? loginButton.querySelector('.btn-text') : null;
  const loadingIcon = loginButton ? loginButton.querySelector('.loading-icon') : null;

  if (loginForm && loginButton && btnText && loadingIcon) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // Impede o envio real do formulário

      // Pega os valores dos campos
      const cpfInput = document.getElementById('cpf');
      const senhaInput = document.getElementById('senha');

      // Ativa o estado de carregamento
      loginButton.disabled = true;
      btnText.textContent = 'Acessando...';
      loadingIcon.style.display = 'inline-block';

      try {
        const response = await fetch('https://sistema.aruanda.workers.dev', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cpf: cpfInput.value,
            senha: senhaInput.value,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          // Se a resposta não for 2xx, lança um erro com a mensagem do worker
          throw new Error(data.error || 'Ocorreu um erro desconhecido.');
        }

        // Sucesso!
        showNotification(`Bem-vindo, ${data.user.nome.split(' ')[0]}!`, 'success');
        
        // Opcional: redirecionar para um painel após um pequeno delay
        // setTimeout(() => {
        //   window.location.href = '/dashboard.html';
        // }, 2000);

      } catch (error) {
        // Erro de rede ou erro lançado pelo worker
        showNotification(error.message, 'error');
      } finally {
        // Garante que o botão seja reativado independentemente do resultado
        loginButton.disabled = false;
        btnText.textContent = 'Entrar';
        loadingIcon.style.display = 'none';
      }
    });
  }
  
  // Adiciona a animação de rotação ao ícone de loading
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .loading-icon {
      animation: spin 1s linear infinite;
    }
  `;
  document.head.appendChild(style);

});
