/**
 * Sistema de Notificação Dinâmico
 * 
 * Funções:
 * - showNotification: Cria e exibe uma notificação.
 * 
 * Características:
 * - Auto-dismiss com barra de progresso.
 * - Pausa ao passar o mouse ou tocar.
 * - Retoma de onde parou.
 * - Tipos de notificação (success, error, info).
 */

document.addEventListener('DOMContentLoaded', () => {
  // Cria o container para as notificações se não existir
  if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }
});

/**
 * Exibe uma notificação na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} [type='info'] - O tipo de notificação ('success', 'error', 'info').
 * @param {number} [duration=5000] - A duração em milissegundos para a notificação ficar visível.
 */
function showNotification(message, type = 'info', duration = 5000) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  // --- 1. CRIAÇÃO DOS ELEMENTOS ---
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;

  const content = document.createElement('div');
  content.className = 'notification-content';

  // Adiciona um ícone (SVG inline para simplicidade)
  const icon = document.createElement('div');
  icon.className = 'notification-icon';
  let svgIcon = '';
  switch (type) {
    case 'success':
      svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      break;
    case 'error':
      svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      break;
    default:
      svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      break;
  }
  icon.innerHTML = svgIcon;

  const text = document.createElement('div');
  text.className = 'notification-message';
  text.textContent = message;

  content.appendChild(icon);
  content.appendChild(text);

  const progress = document.createElement('div');
  progress.className = 'notification-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'notification-progress-bar';
  
  progress.appendChild(progressBar);
  notification.appendChild(content);
  notification.appendChild(progress);

  // --- 2. LÓGICA DE PAUSA E TEMPO ---
  let timer;
  let remaining = duration;
  let startTime;

  const pause = () => {
    clearTimeout(timer);
    remaining -= Date.now() - startTime;
    progressBar.style.animationPlayState = 'paused';
  };

  const resume = () => {
    startTime = Date.now();
    progressBar.style.animationPlayState = 'running';
    timer = setTimeout(() => removeNotification(), remaining);
  };

  const removeNotification = () => {
    notification.classList.add('exiting');
    // Espera a animação de saída terminar para remover o elemento
    notification.addEventListener('animationend', () => {
        if(notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });
  };

  // Adiciona os event listeners
  notification.addEventListener('mouseenter', pause);
  notification.addEventListener('mouseleave', resume);
  notification.addEventListener('touchstart', pause, { passive: true });
  notification.addEventListener('touchend', resume);

  // --- 3. INICIA A NOTIFICAÇÃO ---
  progressBar.style.animationDuration = `${duration}ms`;
  container.appendChild(notification);
  resume(); // Inicia o timer
}
