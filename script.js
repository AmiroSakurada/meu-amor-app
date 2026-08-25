// ============================================================
// CONFIG — troque BACKEND_URL pela URL do Render se mudar
// ============================================================
const ONESIGNAL_APP_ID = 'e00efe06-e5aa-4d27-8fa0-d7e82d7d5210';
const USER_EXTERNAL_ID = 'karol_amor';
const BACKEND_URL = 'https://meu-amor-app.onrender.com';

const statusEl = document.getElementById('status');
const msgEl = document.getElementById('mensagem');
const msgBox = document.querySelector('.message-box');

function setStatus(msg, ok = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('ok', Boolean(ok));
}

function setMessage(text) {
  if (!msgEl) return;
  if (msgBox) msgBox.classList.add('is-updating');
  setTimeout(() => {
    msgEl.textContent = text.startsWith('"') ? text : `"${text}"`;
    if (msgBox) msgBox.classList.remove('is-updating');
  }, 260);
}

// ---------- corações leves ----------
function createHearts() {
  const container = document.getElementById('hearts-bg');
  if (!container) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const emojis = ['❤️', '💕', '✨', '🩷'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 10; i++) {
    const span = document.createElement('span');
    span.className = 'heart-float';
    span.textContent = emojis[i % emojis.length];
    span.style.setProperty('--x', `${8 + Math.random() * 84}%`);
    span.style.setProperty('--size', `${11 + Math.random() * 16}px`);
    span.style.setProperty('--dur', `${16 + Math.random() * 14}s`);
    span.style.setProperty('--delay', `${Math.random() * 10}s`);
    span.style.setProperty('--drift', `${(Math.random() - 0.5) * 40}px`);
    frag.appendChild(span);
  }
  container.appendChild(frag);
}
createHearts();

// ---------- service worker (com fallback e logs) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = new URL('sw.js', window.location.href).pathname;
    navigator.serviceWorker.register(swPath, { scope: './' })
      .then(() => console.log('✅ Service Worker registrado com sucesso!'))
      .catch((err) => {
        console.warn('⚠️ Service Worker falhou, mas o app ainda funciona.', err);
        setStatus('Notificações podem não funcionar. Tente recarregar.', false);
      });
  });
}

// ---------- horários + mensagem ----------
let scheduleTimes = [];

async function fetchJson(url, ms = 9000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function loadSchedule() {
  try {
    const data = await fetchJson(BACKEND_URL + '/schedule');
    scheduleTimes = data.all || [];
    console.log('📅 Horários carregados:', scheduleTimes);
  } catch (e) {
    console.warn('horários fallback', e.message);
    scheduleTimes = ['08:00', '10:30', '13:00', '18:00', '21:00'];
  }
  updateCountdown();
}

async function loadUltimaMensagem() {
  try {
    const data = await fetchJson(BACKEND_URL + '/ultima-mensagem');
    if (data && data.message) {
      const cur = msgEl ? msgEl.textContent : '';
      const placeholder =
        !cur ||
        cur.includes('Aguardando') ||
        cur.includes('Agora você vai receber');
      if (placeholder || data.isLive) {
        setMessage(data.message);
      }
    }
  } catch (_) {}
}

function getNextTime() {
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const sorted = [...scheduleTimes].sort();
  const toM = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  for (const t of sorted) {
    if (toM(t) > nowM) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setMinutes(toM(t));
      return d;
    }
  }
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(toM(sorted[0] || '08:00'));
  return d;
}

function updateCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  if (!scheduleTimes.length) {
    el.textContent = '--:--:--';
    return;
  }
  const diff = Math.max(0, getNextTime() - Date.now());
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  el.textContent = h + ':' + m + ':' + s;
}

loadSchedule();
loadUltimaMensagem();
setInterval(updateCountdown, 1000);
setInterval(loadSchedule, 30 * 60 * 1000);
setInterval(loadUltimaMensagem, 5 * 60 * 1000);

// ============================================================
// ONESIGNAL — INICIALIZAÇÃO ROBUSTA (com timeout)
// ============================================================
window.OneSignalDeferred = window.OneSignalDeferred || [];
let oneSignalReady = false;

// Timeout para não travar o botão se o OneSignal demorar (8 segundos)
const oneSignalTimeout = setTimeout(() => {
  if (!oneSignalReady) {
    console.warn('⏰ OneSignal demorou para iniciar, liberando botão mesmo assim');
    oneSignalReady = true;
    setStatus('Clique em "Ativar notificações" para começar', false);
  }
}, 8000);

OneSignalDeferred.push(async function (OneSignal) {
  clearTimeout(oneSignalTimeout);
  try {
    console.log('🔄 Inicializando OneSignal...');
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerParam: { scope: './' },
      serviceWorkerPath: 'sw.js',
    });
    oneSignalReady = true;
    console.log('✅ OneSignal iniciado com sucesso!');

    const btn = document.getElementById('btnAtivar');
    const hasPermission = OneSignal.Notifications.permission === 'granted';

    if (hasPermission && btn) {
      btn.textContent = 'Notificações ativas ✓';
      btn.classList.add('ativo');
      setStatus('Tudo certo — as mensagens vão chegar no seu celular', true);
      loadUltimaMensagem();
    } else if (btn) {
      setStatus('Clique em "Ativar notificações" para começar', false);
    }
  } catch (err) {
    console.error('❌ Erro no OneSignal:', err);
    oneSignalReady = true; // libera o botão mesmo com erro
    setStatus('Erro ao iniciar notificações. Recarregue a página.', false);
  }
});

// ---------- Botão Ativar (com verificação extra do Service Worker) ----------
document.getElementById('btnAtivar').addEventListener('click', async function () {
  const btn = this;

  // Tenta registrar o Service Worker novamente se ele não existir
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        console.log('🔄 Service Worker não encontrado, registrando novamente...');
        await navigator.serviceWorker.register('sw.js', { scope: './' });
        console.log('✅ Service Worker registrado após clique');
        // Recarrega a página para ativar o SW corretamente
        window.location.reload();
        return;
      }
    } catch (e) {
      console.warn('⚠️ Não foi possível registrar o Service Worker:', e);
    }
  }

  // Se o OneSignal não estiver pronto, tenta forçar a inicialização
  if (!oneSignalReady) {
    setStatus('Aguarde, inicializando...', false);
    if (window.OneSignal) {
      try {
        await window.OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          notifyButton: { enable: false },
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerParam: { scope: './' },
          serviceWorkerPath: 'sw.js',
        });
        oneSignalReady = true;
        console.log('✅ OneSignal iniciado após clique');
      } catch (e) {
        console.error('❌ Falha ao forçar inicialização:', e);
        setStatus('Erro ao iniciar. Recarregue a página.', false);
        return;
      }
    } else {
      setStatus('Ainda carregando… tenta de novo em 3 segundos', false);
      return;
    }
  }

  btn.disabled = true;
  setStatus('');
  try {
    // Faz login com o ID da Karol
    await window.OneSignal.login(USER_EXTERNAL_ID);
    const allowed = await window.OneSignal.Notifications.requestPermission();
    if (allowed) {
      btn.textContent = 'Notificações ativas ✓';
      btn.classList.add('ativo');
      setStatus('Pronto! Pode fechar o app — as mensagens chegam igual ❤️', true);
      setMessage('Agora você vai receber todo meu amor no celular');
      setTimeout(loadUltimaMensagem, 700);
    } else {
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setStatus(
        isiOS
          ? 'No iPhone: toque em Compartilhar → “Adicionar à Tela de Início”, abra pelo ícone e permita notificações.'
          : 'Permita as notificações nas configurações do navegador (ícone do cadeado).'
      );
    }
  } catch (e) {
    console.error('❌ Erro ao ativar notificações:', e);
    setStatus('Algo deu errado. Tenta de novo ou libera notificações nas configs.', false);
  } finally {
    btn.disabled = false;
  }
});
