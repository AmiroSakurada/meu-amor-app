// ============================================================
// 0. FUSO HORÁRIO — precisa ser definido ANTES de qualquer Date()
// ============================================================
process.env.TZ = process.env.TZ || 'America/Bahia';

const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança básica + CORS
app.use(helmet({
  contentSecurityPolicy: false, // PWA + OneSignal precisam de flexibilidade
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
app.use(express.json());

// ============================================================
// 1. GERADOR DE MENSAGENS (por período do dia)
// ============================================================
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

const APELIDOS = [
  'meu bem', 'meu amor', 'minha gostosa', 'minha fotógrafa',
  'meu docinho', 'minha delícia', 'minha linda', 'minha gata',
  'meu amorzinho', 'minha princesa', 'meu coração', 'minha vida'
];

const FRASES_POR_PERIODO = {
  manha: [
    (ap) => `Bom dia, ${ap}. Acordei pensando em você e no quanto tenho orgulho de tudo que você faz.`,
    (ap) => `Bom dia, ${ap}. Que seu dia comece leve e com o coração quentinho.`,
    (ap) => `Acordei com saudade, ${ap}. Queria te abraçar agora. Bom dia, beijinhos.`,
    (ap) => `Bom dia, linda. Tô pensando na gente e no quanto você me faz bem. Te amo, ${ap}.`,
    (ap) => `Oi, ${ap}. Só passando pra te lembrar que você é a minha fotógrafa favorita e o amor da minha vida.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, seu sorriso ainda é a coisa mais linda que eu conheço. Te amo demais.`,
    (ap) => `E aí, ${ap}. Só um lembrete: você é foda. E eu te amo muito.`,
    (ap) => `Passando só pra dizer: te amo infinito, ${ap}. Seu jeito me encanta.`,
  ],
  tarde: [
    (ap) => `Boa tarde, ${ap}. Tô aqui do seu lado, mesmo de longe. Vai com calma e com tudo — eu acredito em você.`,
    (ap) => `Boa tarde, ${ap}. Ver você crescer me dá um orgulho gigante. Continua sendo você.`,
    (ap) => `Ei, ${ap}. Cada foto sua me faz lembrar o quanto você tem talento. Sou seu fã número 1.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, você é forte, guerreira e incrível. Não esquece disso.`,
    (ap) => `Oi, ${ap}. Suas fotos capturam alma de verdade. Orgulho não cabe no peito.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, você não está sozinha. Estou aqui, sempre. Com carinho.`,
    (ap) => `Não resisti e vim te dizer: você é tudo que eu quero, ${ap}. ❤️`,
    (ap) => `Só queria te falar que você é uma pessoa maravilhosa, ${ap}. Te amo demais.`,
  ],
  noite: [
    (ap) => `Boa noite, ${ap}. Obrigado por existir na minha vida. Te escolho todos os dias.`,
    (ap) => `Boa noite, ${ap}. Descansa que eu tô aqui. Um abraço gigante.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, meu amor por você só cresce. Sempre seu.`,
    (ap) => `Ei, ${ap}. Confio em você plenamente. Juntos somos mais fortes.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, cada clique seu é uma obra de arte. Amo ver o mundo pelos seus olhos.`,
    (ap) => `Passando só pra dizer: te amo infinito, ${ap}. Seu jeito me encanta.`,
    (ap) => `Oi, ${ap}. Só passando pra te lembrar que você é a minha fotógrafa favorita e o amor da minha vida.`,
    (ap) => `Não resisti e vim te dizer: você é tudo que eu quero, ${ap}. ❤️`,
  ],
};

const EXTRAS = ['', ' kkk', ' 💕', ' ❤️', ' hehe', ' 🩷', ' bjs', ''];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gerarMensagensPorPeriodo(quantidadePorPeriodo = 100) {
  const result = { manha: [], tarde: [], noite: [] };
  for (const periodo of Object.keys(FRASES_POR_PERIODO)) {
    const set = new Set();
    let tries = 0;
    while (set.size < quantidadePorPeriodo && tries < 20000) {
      tries++;
      const ap = random(APELIDOS);
      const base = random(FRASES_POR_PERIODO[periodo])(ap);
      const msg = (base + random(EXTRAS)).replace(/\s+/g, ' ').trim();
      if (msg.length >= 28 && msg.length <= 180) set.add(msg);
    }
    result[periodo] = Array.from(set);
  }
  return result;
}

/** @type {{ manha: string[], tarde: string[], noite: string[] }} */
let messagesByPeriod = { manha: [], tarde: [], noite: [] };

try {
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.log('🔨 Gerando mensagens por período...');
    messagesByPeriod = gerarMensagensPorPeriodo(100);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesByPeriod, null, 2));
    console.log(`✅ manhã=${messagesByPeriod.manha.length} tarde=${messagesByPeriod.tarde.length} noite=${messagesByPeriod.noite.length}`);
  } else {
    const raw = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    // Compatibilidade: se for array antigo (lista única), regenera
    if (Array.isArray(raw)) {
      console.log('🔄 messages.json antigo (lista única) → regenerando por período...');
      messagesByPeriod = gerarMensagensPorPeriodo(100);
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesByPeriod, null, 2));
    } else if (raw && raw.manha && raw.tarde && raw.noite) {
      messagesByPeriod = raw;
      console.log(`📚 mensagens carregadas: manhã=${raw.manha.length} tarde=${raw.tarde.length} noite=${raw.noite.length}`);
    } else {
      messagesByPeriod = gerarMensagensPorPeriodo(100);
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesByPeriod, null, 2));
    }
  }
} catch (e) {
  console.error('⚠️ Erro ao ler/gerar messages.json, regenerando em memória:', e.message);
  messagesByPeriod = gerarMensagensPorPeriodo(100);
}

function fallbackMsgs(periodo) {
  const defaults = {
    manha: 'Bom dia, meu amor. Acordei pensando em você. ❤️',
    tarde: 'Boa tarde, meu bem. Tô aqui, sempre. 💕',
    noite: 'Boa noite, meu amor. Descansa que eu tô aqui. 🩷',
  };
  return [defaults[periodo] || defaults.noite];
}

/** Retorna o período do dia com base na hora local (TZ já configurado). */
function getPeriodoDoDia(date = new Date()) {
  const h = date.getHours();
  // 05:00–11:59 → manhã | 12:00–17:59 → tarde | 18:00–04:59 → noite
  if (h >= 5 && h < 12) return 'manha';
  if (h >= 12 && h < 18) return 'tarde';
  return 'noite';
}

function escolherMensagemDoPeriodo() {
  const periodo = getPeriodoDoDia();
  const pool = messagesByPeriod[periodo];
  if (pool && pool.length > 0) {
    return random(pool);
  }
  return random(fallbackMsgs(periodo));
}

// Última mensagem enviada (para a tela do app mostrar)
let lastSentMessage = null;
let lastSentAt = null;

// ============================================================
// 2. HORÁRIOS — fixos + 2 aleatórios (regenerados TODO DIA)
// ============================================================
const FIXED_TIMES = ['08:00', '13:00', '18:00'];
const FIXED_MINUTES = [480, 780, 1080]; // 8h, 13h, 18h
const BUFFER = 90; // 1h30 de distância mínima

function gerarHorariosAleatorios() {
  const available = [];
  for (let i = 0; i < 1440; i++) {
    let blocked = false;
    for (const f of FIXED_MINUTES) {
      if (i >= f - BUFFER && i <= f + BUFFER) {
        blocked = true;
        break;
      }
    }
    // Evita madrugada extrema (00:00–05:59) e muito tarde (23:00+)
    if (i < 360 || i >= 1380) blocked = true;
    if (!blocked) available.push(i);
  }
  if (available.length < 2) return [600, 1320]; // 10:00 e 22:00 fallback

  let escolhidos = [];
  let tentativas = 0;
  while (escolhidos.length < 2 && tentativas < 10000) {
    tentativas++;
    const t1 = available[Math.floor(Math.random() * available.length)];
    const t2 = available[Math.floor(Math.random() * available.length)];
    if (Math.abs(t1 - t2) >= BUFFER) {
      escolhidos = [t1, t2].sort((a, b) => a - b);
    }
  }
  if (escolhidos.length < 2) {
    escolhidos = [available[0], available[available.length - 1]];
  }
  return escolhidos;
}

function minutesToStr(t) {
  const h = String(Math.floor(t / 60)).padStart(2, '0');
  const m = String(t % 60).padStart(2, '0');
  return `${h}:${m}`;
}

let randomTimes = gerarHorariosAleatorios();
let randomTimesStr = randomTimes.map(minutesToStr);
let allTimes = [...FIXED_TIMES, ...randomTimesStr];
let sentToday = new Set();
let currentDate = new Date().toDateString();

function regenerarHorariosDoDia() {
  randomTimes = gerarHorariosAleatorios();
  randomTimesStr = randomTimes.map(minutesToStr);
  allTimes = [...FIXED_TIMES, ...randomTimesStr];
  sentToday.clear();
  currentDate = new Date().toDateString();
  console.log(`📅 Novo dia! Fixos: ${FIXED_TIMES.join(', ')} | Aleatórios: ${randomTimesStr.join(' e ')}`);
}

console.log(`🕒 Horários Fixos: ${FIXED_TIMES.join(', ')} (fuso: ${process.env.TZ})`);
console.log(`🎲 Horários Aleatórios de hoje: ${randomTimesStr.join(' e ')}`);

// ============================================================
// 3. ONESIGNAL
// ============================================================
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || 'e00efe06-e5aa-4d27-8fa0-d7e82d7d5210';
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const USER_ID = process.env.USER_ID || 'karol_amor';

if (!ONESIGNAL_API_KEY) {
  console.error('❌ ERRO: ONESIGNAL_API_KEY não configurada!');
  console.error('   Adicione a variável de ambiente no Render (Settings > Environment).');
}

// ============================================================
// 4. ENVIO DA MENSAGEM (push + registro para a tela)
// ============================================================
async function sendLoveMessage() {
  if (!ONESIGNAL_API_KEY) {
    console.error('❌ ONESIGNAL_API_KEY não definida. Mensagem não enviada.');
    return;
  }
  const periodo = getPeriodoDoDia();
  const randomMsg = escolherMensagemDoPeriodo();
  lastSentMessage = randomMsg;
  lastSentAt = new Date().toISOString();

  try {
    await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [USER_ID],
      channel_for_external_user_ids: 'push',
      headings: { en: '💖 Meu amor, olha isso...' },
      contents: { en: randomMsg },
      data: { screen: 'Mensagem', message: randomMsg, periodo },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
      },
      timeout: 12000,
    });
    console.log(`✅ [${periodo}] Mensagem enviada: "${randomMsg.slice(0, 50)}..."`);
  } catch (error) {
    console.error('❌ Erro ao enviar:', error.response?.data || error.message);
  }
}

// ============================================================
// 5. CRON — a cada minuto + regeneração diária
// ============================================================
cron.schedule('* * * * *', () => {
  const now = new Date();
  const today = now.toDateString();

  // Novo dia → regenera aleatórios
  if (today !== currentDate) {
    regenerarHorariosDoDia();
  }

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;

  if (allTimes.includes(currentTime) && !sentToday.has(currentTime)) {
    sendLoveMessage();
    sentToday.add(currentTime);
    console.log(`⏰ Disparado às ${currentTime} (período: ${getPeriodoDoDia()})`);
  }
}, { timezone: process.env.TZ });

// ============================================================
// 6. LISTINHA (checklist compartilhada)
// ============================================================
const LIST_FILE = path.join(__dirname, 'listinha.json');

function loadListinha() {
  try {
    if (fs.existsSync(LIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('⚠️ Erro ao ler listinha:', e.message);
  }
  return [];
}

function saveListinha(items) {
  try {
    fs.writeFileSync(LIST_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    console.error('⚠️ Erro ao salvar listinha:', e.message);
  }
}

let listinha = loadListinha();
console.log(`📝 Listinha: ${listinha.length} item(ns)`);

// ============================================================
// 7. ROTAS
// ============================================================
app.get('/ping', (req, res) => res.json({
  ok: true,
  message: '❤️ Servidor do amor está on!',
  tz: process.env.TZ,
  periodo: getPeriodoDoDia(),
  nextTimes: allTimes,
}));

app.get('/schedule', (req, res) => {
  res.json({
    fixed: FIXED_TIMES,
    random: randomTimesStr,
    all: allTimes,
    timezone: process.env.TZ,
    periodo: getPeriodoDoDia(),
    lastSentAt,
  });
});

// Última mensagem enviada (para a tela do app mostrar)
app.get('/ultima-mensagem', (req, res) => {
  const periodo = getPeriodoDoDia();
  const pool = messagesByPeriod[periodo] || fallbackMsgs(periodo);
  res.json({
    message: lastSentMessage || random(pool),
    sentAt: lastSentAt,
    isLive: Boolean(lastSentMessage),
    periodo,
  });
});

app.get('/mensagens', (req, res) => {
  const periodo = getPeriodoDoDia();
  const pool = messagesByPeriod[periodo] || [];
  res.json({
    total: {
      manha: (messagesByPeriod.manha || []).length,
      tarde: (messagesByPeriod.tarde || []).length,
      noite: (messagesByPeriod.noite || []).length,
    },
    periodoAtual: periodo,
    exemplo: pool.length ? random(pool) : null,
  });
});

// Rota de teste manual — útil no deploy
app.get('/test-send', async (req, res) => {
  if (!ONESIGNAL_API_KEY) {
    return res.status(500).json({ error: 'ONESIGNAL_API_KEY não configurada' });
  }
  await sendLoveMessage();
  res.json({
    ok: true,
    message: lastSentMessage,
    periodo: getPeriodoDoDia(),
    hint: 'Verifique a notificação no celular da Karol (ela precisa ter ativado as notificações no app).',
  });
});

// ---------- Listinha API ----------
app.get('/listinha', (req, res) => {
  res.json({ items: listinha });
});

app.post('/listinha', (req, res) => {
  const text = (req.body?.text || '').trim();
  const author = (req.body?.author || '').trim().slice(0, 40) || 'nós';
  if (!text || text.length > 200) {
    return res.status(400).json({ error: 'Texto inválido (1–200 caracteres)' });
  }
  const item = {
    id: crypto.randomUUID(),
    text,
    author,
    done: false,
    createdAt: new Date().toISOString(),
  };
  listinha.unshift(item);
  saveListinha(listinha);
  res.status(201).json({ item, items: listinha });
});

app.patch('/listinha/:id', (req, res) => {
  const { id } = req.params;
  const idx = listinha.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item não encontrado' });

  if (typeof req.body?.done === 'boolean') {
    listinha[idx].done = req.body.done;
  }
  if (typeof req.body?.text === 'string') {
    const t = req.body.text.trim();
    if (t && t.length <= 200) listinha[idx].text = t;
  }
  saveListinha(listinha);
  res.json({ item: listinha[idx], items: listinha });
});

app.delete('/listinha/:id', (req, res) => {
  const { id } = req.params;
  const before = listinha.length;
  listinha = listinha.filter((i) => i.id !== id);
  if (listinha.length === before) {
    return res.status(404).json({ error: 'Item não encontrado' });
  }
  saveListinha(listinha);
  res.json({ ok: true, items: listinha });
});

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno' });
});

// ============================================================
// 8. SELF-PING (Render free)
// ============================================================
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;
if (process.env.NODE_ENV !== 'development' && PUBLIC_URL) {
  console.log('🔄 Self-ping ativado!');
  setInterval(() => {
    axios.get(PUBLIC_URL + '/ping', { timeout: 8000 })
      .then(() => console.log('🔄 Ping ok'))
      .catch(err => console.error('❌ Ping falhou:', err.message));
  }, 12 * 60 * 1000);
} else if (process.env.NODE_ENV !== 'development') {
  console.log('ℹ️ Self-ping desativado: defina RENDER_EXTERNAL_URL se quiser manter o serviço acordado.');
}

// ============================================================
// 9. START
// ============================================================
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
  console.log(`🕐 Período atual: ${getPeriodoDoDia()} (hora local: ${new Date().toLocaleTimeString('pt-BR')})`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
