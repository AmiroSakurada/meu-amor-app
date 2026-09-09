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

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = new URL('sw.js', window.location.href).pathname;
    navigator.serviceWorker.register(swPath, { scope: './' }).catch(() => {});
  });
}

// ---------- horários + mensagem ----------
let scheduleTimes = [];

async function fetchJson(url, ms = 9000, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
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

// ---------- OneSignal (iPhone + Android) ----------
window.OneSignalDeferred = window.OneSignalDeferred || [];
let oneSignalReady = false;

OneSignalDeferred.push(async function (OneSignal) {
  try {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerParam: { scope: './' },
      serviceWorkerPath: 'sw.js',
    });
    oneSignalReady = true;

    const btn = document.getElementById('btnAtivar');
    if (OneSignal.Notifications.permission && btn) {
      btn.textContent = 'Notificações ativas ✓';
      btn.classList.add('ativo');
      setStatus('Tudo certo — as mensagens vão chegar no seu celular', true);
      loadUltimaMensagem();
    }
  } catch (err) {
    console.error(err);
    setStatus('Não deu pra iniciar as notificações. Recarrega a página?');
  }
});

document.getElementById('btnAtivar').addEventListener('click', async function () {
  const btn = this;
  if (!oneSignalReady || typeof OneSignal === 'undefined') {
    setStatus('Ainda carregando… tenta de novo em 2 segundos');
    return;
  }
  btn.disabled = true;
  setStatus('');
  try {
    // mesmo ID do backend → push chega no aparelho dela
    await OneSignal.login(USER_EXTERNAL_ID);
    const allowed = await OneSignal.Notifications.requestPermission();
    if (allowed) {
      btn.textContent = 'Notificações ativas ✓';
      btn.classList.add('ativo');
      setStatus('Pronto! Pode fechar o app — as mensagens chegam igual ❤️', true);
      setMessage('Agora você vai receber todo meu amor no celular');
      setTimeout(loadUltimaMensagem, 700);
    } else {
      // iOS Safari precisa de Add to Home Screen + permissão
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setStatus(
        isiOS
          ? 'No iPhone: toque em Compartilhar → “Adicionar à Tela de Início”, abra pelo ícone e permita notificações.'
          : 'Permita as notificações nas configurações do navegador (ícone do cadeado).'
      );
    }
  } catch (e) {
    console.error(e);
    setStatus('Algo deu errado. Tenta de novo ou libera notificações nas configs.');
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
// LISTINHA
// ============================================================
const listinhaItemsEl = document.getElementById('listinhaItems');
const listinhaEmptyEl = document.getElementById('listinhaEmpty');
const listinhaForm = document.getElementById('listinhaForm');
const listinhaInput = document.getElementById('listinhaInput');
const listinhaAuthor = document.getElementById('listinhaAuthor');

function renderListinha(items) {
  if (!listinhaItemsEl) return;
  listinhaItemsEl.innerHTML = '';

  if (!items || items.length === 0) {
    if (listinhaEmptyEl) listinhaEmptyEl.hidden = false;
    return;
  }
  if (listinhaEmptyEl) listinhaEmptyEl.hidden = true;

  // pendentes primeiro, depois concluídos
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  for (const item of sorted) {
    const li = document.createElement('li');
    li.className = 'listinha-item' + (item.done ? ' is-done' : '');
    li.dataset.id = item.id;

    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'listinha-check';
    check.setAttribute('aria-label', item.done ? 'Desmarcar' : 'Marcar como feito');
    check.innerHTML = item.done ? '✓' : '';
    check.addEventListener('click', () => toggleItem(item.id, !item.done));

    const body = document.createElement('div');
    body.className = 'listinha-body';

    const text = document.createElement('span');
    text.className = 'listinha-text';
    text.textContent = item.text;

    const meta = document.createElement('span');
    meta.className = 'listinha-meta';
    meta.textContent = item.author || 'nós';

    body.appendChild(text);
    body.appendChild(meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'listinha-del';
    del.setAttribute('aria-label', 'Apagar');
    del.textContent = '×';
    del.addEventListener('click', () => deleteItem(item.id));

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);
    listinhaItemsEl.appendChild(li);
  }
}

async function loadListinha() {
  try {
    const data = await fetchJson(BACKEND_URL + '/listinha');
    renderListinha(data.items || []);
  } catch (e) {
    console.warn('listinha falhou', e.message);
    if (listinhaEmptyEl) {
      listinhaEmptyEl.hidden = false;
      listinhaEmptyEl.textContent = 'Não deu pra carregar a listinha agora 💔';
    }
  }
}

async function addItem(text, author) {
  try {
    const data = await fetchJson(BACKEND_URL + '/listinha', 9000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author }),
    });
    renderListinha(data.items || []);
  } catch (e) {
    console.error(e);
    alert('Não deu pra adicionar. Tenta de novo?');
  }
}

async function toggleItem(id, done) {
  try {
    const data = await fetchJson(BACKEND_URL + '/listinha/' + id, 9000, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    renderListinha(data.items || []);
  } catch (e) {
    console.error(e);
  }
}

async function deleteItem(id) {
  if (!confirm('Apagar este item?')) return;
  try {
    const data = await fetchJson(BACKEND_URL + '/listinha/' + id, 9000, {
      method: 'DELETE',
    });
    renderListinha(data.items || []);
  } catch (e) {
    console.error(e);
  }
}

if (listinhaForm) {
  listinhaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (listinhaInput.value || '').trim();
    if (!text) return;
    const author = listinhaAuthor.value || 'nós';
    listinhaInput.value = '';
    addItem(text, author);
  });
}

// carrega e atualiza a cada 30s (pra ambos verem mudanças)
loadListinha();
setInterval(loadListinha, 30 * 1000);
