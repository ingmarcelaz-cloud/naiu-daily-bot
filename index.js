const https = require('https');
const http = require('http');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const BTC_ALERT_PRICE = 60000;

let btcAlertSent = false;
let lastAlertDate = '';

async function getBitcoinPrice() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.coingecko.com',
      path: '/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.bitcoin.usd);
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error('Error Claude'));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendTelegram(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + TELEGRAM_TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

async function checkBitcoin() {
  const price = await getBitcoinPrice();
  if (!price) return;

  const today = new Date().toISOString().split('T')[0];

  if (price < BTC_ALERT_PRICE) {
    if (!btcAlertSent || lastAlertDate !== today) {
      btcAlertSent = true;
      lastAlertDate = today;
      const priceFormatted = price.toLocaleString('es-CO');
      await sendTelegram(
        '⚠️ *ALERTA BITCOIN*\n\n' +
        'Bitcoin bajó de $60,000 USD\n' +
        'Precio actual: *$' + priceFormatted + ' USD*\n\n' +
        'Revisa tu posición 👀'
      );
    }
  } else {
    btcAlertSent = false;
  }
}

async function sendDailyMessage() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const colombiaOffset = -5;
  const colombiaHour = (hour + colombiaOffset + 24) % 24;

  if (colombiaHour !== 8) return;

  if (day === 1 || day === 3 || day === 5) {
    await sendTelegram(
      '🎨 *Buenos días!*\n\n' +
      'Hoy toca carrusel para NAIU.\n\n' +
      'Abre Claude → tu proyecto → escribe *"dame ideas"* 🚀'
    );
  } else if (day === 2 || day === 4) {
    const prompt = 'Eres el asistente de NAIU, agencia de IA colombiana.\n\n' +
      'Genera el mensaje de hoy con este formato EXACTO:\n\n' +
      '🤖 Novedad IA — [fecha de hoy]\n\n' +
      '📰 Novedad del día:\n[Una novedad real de IA de esta semana, explicada en 2 líneas simples]\n\n' +
      '⚡ Cómo aplicarla esta semana:\n[Un caso práctico concreto para un empresario colombiano, con herramienta real y paso a paso en 3 líneas]\n\n' +
      '🎯 Hazlo hoy:\n[Una acción de 5 minutos que pueden hacer ahora mismo]\n\n' +
      'Sé concreto y práctico. Sin introducciones.';
    const message = await callClaude(prompt);
    await sendTelegram(message);
  } else if (day === 0 || day === 6) {
    const prompt = 'Eres el asistente de NAIU.\n\n' +
      'Genera un tip para Kary, instructora del SENA, con este formato:\n\n' +
      '👩‍🏫 Tip para Kary — [fecha]\n\n' +
      '💡 Tip de hoy:\n[Un tip práctico de IA para ahorrar tiempo en tareas del SENA: preparar clases, revisar correos, registrar asistencias, dar feedback a estudiantes]\n\n' +
      '🛠 Herramienta:\n[Herramienta gratuita o de bajo costo con instrucción concreta]\n\n' +
      '⏱ Tiempo que ahorra:\n[Estimado realista]\n\n' +
      'Sé específico y práctico.';
    const message = await callClaude(prompt);
    await sendTelegram(message);
  }
}

setInterval(async () => {
  await checkBitcoin();
}, 30 * 60 * 1000);

setInterval(async () => {
  await sendDailyMessage();
}, 60 * 60 * 1000);

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('NAIU Bot corriendo');
});

server.listen(PORT, () => {
  console.log('Bot corriendo en puerto ' + PORT);
});
