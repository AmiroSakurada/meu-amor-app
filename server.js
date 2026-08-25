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

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança básica + CORS
app.use(helmet({
  contentSecurityPolicy: false, // PWA + OneSignal precisam de flexibilidade
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET'],
}));
app.use(express.json());

// ============================================================
// 1. GERADOR DE MENSAGENS (limpo, com sentido garantido)
// ============================================================
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

function gerarMensagensUnicas(quantidade = 300) {
  const apelidos = [
    'meu bem', 'meu amor', 'minha gostosa', 'minha fotógrafa',
    'meu docinho', 'minha delícia', 'minha linda', 'minha gata',
    'meu amorzinho', 'minha princesa', 'meu coração', 'minha vida'
  ];
  const frases = [
    (ap) => `Bom dia, ${ap}. Acordei pensando em você e no quanto tenho orgulho de tudo que você faz.`,
    (ap) => `Oi, ${ap}. Só passando pra te lembrar que você é a minha fotógrafa favorita e o amor da minha vida.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, seu sorriso ainda é a coisa mais linda que eu conheço. Te amo demais.`,
    (ap) => `Boa tarde, ${ap}. Tô aqui do seu lado, mesmo de longe. Vai com calma e com tudo — eu acredito em você.`,
    (ap) => `Ei, ${ap}. Cada foto sua me faz lembrar o quanto você tem talento. Sou seu fã número 1.`,
    (ap) => `Boa noite, ${ap}. Obrigado por existir na minha vida. Te escolho todos os dias.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, você é forte, guerreira e incrível. Não esquece disso.`,
    (ap) => `Passando só pra dizer: te amo infinito, ${ap}. Seu jeito me encanta.`,
    (ap) => `Oi, ${ap}. Suas fotos capturam alma de verdade. Orgulho não cabe no peito.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, você não está sozinha. Estou aqui, sempre. Com carinho.`,
    (ap) => `Acordei com saudade, ${ap}. Queria te abraçar agora. Beijinhos.`,
    (ap) => `E aí, ${ap}. Só um lembrete: você é foda. E eu te amo muito.`,
    (ap) => `Boa tarde, ${ap}. Ver você crescer me dá um orgulho gigante. Continua sendo você.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, meu amor por você só cresce. Sempre seu.`,
    (ap) => `Oi, linda. Tô pensando na gente e no quanto você me faz bem. Te amo, ${ap}.`,
    (ap) => `Não resisti e vim te dizer: você é tudo que eu quero, ${ap}. ❤️`,
    (ap) => `Boa noite, ${ap}. Descansa que eu tô aqui. Um abraço gigante.`,
    (ap) => `${ap.charAt(0).toUpperCase() + ap.slice(1)}, cada clique seu é uma obra de arte. Amo ver o mundo pelos seus olhos.`,
    (ap) => `Ei, ${ap}. Confio em você plenamente. Juntos somos mais fortes.`,
    (ap) => `Só queria te falar que você é uma pessoa maravilhosa, ${ap}. Te amo demais.`,
  ];
  const extras = [
    '', ' kkk', ' 💕', ' ❤️', ' hehe', ' 🩷', ' bjs', ''
  ];
  const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const set = new Set();
  let tries = 0;
  while (set.size < quantidade && tries < 30000) {
    tries++;
    const ap = random(apelidos);
    const base = random(frases)(ap);
    const msg = (base + random(extras)).replace(/\s+/g, ' ').trim();
    if (msg.length >= 28 && msg.length <= 180) set.add(msg);
  }
  return Array.from(set);
}

let messages = [];
try {
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.log('🔨 Gerando 300 mensagens...');
    messages = gerarMensagensUnicas(300);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    console.log(`✅ ${messages.length} mensagens salvas`);
  } else {
    messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    console.log(`📚 ${messages.length} mensagens carregadas.`);
  }
} catch (e) {
  console.error('⚠️ Erro ao ler/gerar messages.json, regenerando em memória:', e.message);
  messages = gerarMensagensUnicas(300);
}

if (!messages || messages.length === 0) {
  messages = ['Só passando pra te lembrar que eu te amo muito. ❤️'];
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
  const randomMsg = messages[Math.floor(Math.random() * messages.length)];
  lastSentMessage = randomMsg;
  lastSentAt = new Date().toISOString();

  try {
    await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [USER_ID],
      channel_for_external_user_ids: 'push',
      headings: { en: '💖 Meu amor, olha isso...' },
      contents: { en: randomMsg },
      data: { screen: 'Mensagem', message: randomMsg },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
      },
      timeout: 12000,
    });
    console.log(`✅ Mensagem enviada: "${randomMsg.slice(0, 50)}..."`);
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
    console.log(`⏰ Disparado às ${currentTime}`);
  }
}, { timezone: process.env.TZ });

// ============================================================
// 6. ROTAS
// ============================================================
app.get('/ping', (req, res) => res.json({
  ok: true,
  message: '❤️ Servidor do amor está on!',
  tz: process.env.TZ,
  nextTimes: allTimes,
}));

app.get('/schedule', (req, res) => {
  res.json({
    fixed: FIXED_TIMES,
    random: randomTimesStr,
    all: allTimes,
    timezone: process.env.TZ,
    lastSentAt,
  });
});

// Última mensagem enviada (para a tela do app mostrar)
app.get('/ultima-mensagem', (req, res) => {
  res.json({
    message: lastSentMessage || messages[Math.floor(Math.random() * messages.length)],
    sentAt: lastSentAt,
    isLive: Boolean(lastSentMessage),
  });
});

app.get('/mensagens', (req, res) => {
  res.json({
    total: messages.length,
    exemplo: messages[Math.floor(Math.random() * messages.length)],
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
    hint: 'Verifique a notificação no celular da Karol (ela precisa ter ativado as notificações no app).',
  });
});

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno' });
});

// ============================================================
// 7. SELF-PING (Render free)
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
// 8. START
// ============================================================
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
