const https = require('https');
const http = require('http');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = '33c91e9cb74c800ea6b4df4ec7d32787';
const PORT = process.env.PORT || 3000;

const DESIGN_SYSTEM = `
SISTEMA DE DISENO NAIU:
- Fondo claro: #fffbf3 | Fondo oscuro: #1f3a33 | Acento: #ff5353
- Patron fondos: Slide1 cream, Slide2 cream, Slide3 dark, Slide4 cream, Slide5 dark, Slide6 cream
- Titulo hero slide1: serif italic bold, una palabra en rojo #ff5353
- Titulos resto: sans-serif bold 22-28px
- Cuerpo: max 60 palabras por slide
- Badge pill arriba izquierda con dot rojo
- Footer: @naiu_ia + barra progreso 3px
- Dimensiones: 1080x1350px
`;

let pendingIdeas = {};

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
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
            reject(new Error('Error Claude: ' + JSON.stringify(parsed)));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendTelegram(chatId, message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
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
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function saveToNotion(hook, date) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Idea: { title: [{ text: { content: hook.substring(0, 200) } }] },
        Fecha: { date: { start: date } },
        Estado: { select: { name: 'Usada' } }
      }
    });
    const req = https.request({
      hostname: 'api.notion.com',
      path: '/v1/pages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Notion-Version': '2022-06-28'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUsedIdeas() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      filter: { property: 'Estado', select: { equals: 'Usada' } }
    });
    const req = https.request({
      hostname: 'api.notion.com',
      path: '/v1/databases/' + NOTION_DATABASE_ID + '/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Notion-Version': '2022-06-28'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        const ideas = parsed.results ? parsed.results.map(function(p) {
          return p.properties && p.properties.Idea && p.properties.Idea.title && p.properties.Idea.title[0] ? p.properties.Idea.title[0].text.content : '';
        }).filter(Boolean) : [];
        resolve(ideas);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendDailyIdeas(chatId) {
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const usedIdeas = await getUsedIdeas();
  const usedSection = usedIdeas.length > 0 ? '\nIDEAS YA USADAS (no repetir):\n' + usedIdeas.slice(-10).join('\n') + '\n' : '';

  const prompt = 'Eres el cerebro estratega de NAIU, agencia de IA colombiana.\n\nAUDIENCIAS:\n1. Empresarios que pierden horas en tareas repetitivas\n2. Curiosos de IA que creen que es solo para programadores\n' + usedSection + '\nREGLA: Cada Slide 6 debe revelar herramienta real con nombre y que hace. Terminar con: Esto te esta pasando? Comenta SI y hablamos\n\nHoy es ' + today + '. Dame 5 ideas:\n\n1. HOOK: [frase potente]\nPor que funciona: [dolor]\nSlide 6: [herramienta + CTA]\n\n2. HOOK: [frase potente]\nPor que funciona: [dolor]\nSlide 6: [herramienta + CTA]\n\n3. HOOK: [frase potente]\nPor que funciona: [dolor]\nSlide 6: [herramienta + CTA]\n\n4. HOOK: [frase potente]\nPor que funciona: [dolor]\nSlide 6: [herramienta + CTA]\n\n5. HOOK: [frase potente]\nPor que funciona: [dolor]\nSlide 6: [herramienta + CTA]\n\nAl final: Responde 1, 2, 3, 4 o 5 para desarrollar esa idea';

  const ideas = await callClaude(prompt);
  pendingIdeas[chatId] = { ideas: ideas, date: new Date().toISOString().split('T')[0] };
  await sendTelegram(chatId, ideas);
}

async function generateSlides(chatId, ideaNumber) {
  const data = pendingIdeas[chatId];
  if (!data) {
    await sendTelegram(chatId, 'No hay ideas pendientes. Escribe /ideas para obtener nuevas.');
    return;
  }

  const lines = data.ideas.split('\n');
const hookLine = lines.find(l => l.includes(`${ideaNumber}. HOOK:`) || l.includes(`## ${ideaNumber}. HOOK:`));

  if (!hookLine) {
    await sendTelegram(chatId, 'Numero no valido. Responde con 1, 2, 3, 4 o 5.');
    return;
  }

  const hook = hookLine.replace(/.*HOOK:\s*/, '').trim();
  await sendTelegram(chatId, 'Generando los 6 slides para:\n"' + hook + '"\n\nEspera un momento...');

  const prompt = 'Eres el generador de carruseles de NAIU (@naiu_ia).\n\n' + DESIGN_SYSTEM + '\n\nGenera 6 slides para este carousel.\nHOOK: "' + hook + '"\n\n---SLIDE 1---\nFONDO: cream\nBADGE: [categoria]\nTITULO HERO: [titulo serif italic, una palabra en rojo]\nSUBTITULO: [max 10 palabras]\nCTA BLOCK: "Mas en NAIU Newsletter"\nPROGRESO: 1/6\n\n---SLIDE 2---\nFONDO: cream\nBADGE: [categoria]\nTITULO: [titulo bold]\nPUNTO 1: [max 15 palabras]\nPUNTO 2: [max 15 palabras]\nPUNTO 3: [max 15 palabras]\nPROGRESO: 2/6\n\n---SLIDE 3---\nFONDO: dark\nBADGE: [categoria]\nTITULO: [titulo impactante]\nPRO TIP: [consejo, max 40 palabras]\nPROGRESO: 3/6\n\n---SLIDE 4---\nFONDO: cream\nBADGE: DATO CLAVE\nNUMERO GRANDE: [estadistica]\nCONTEXTO: [max 20 palabras]\nPROGRESO: 4/6\n\n---SLIDE 5---\nFONDO: dark\nBADGE: HERRAMIENTA\nTITULO: [nombre herramienta]\nPASO 1: [accion]\nPASO 2: [accion]\nPASO 3: [accion]\nCTA: Esto te esta pasando? Comenta SI y hablamos\nPROGRESO: 5/6\n\n---SLIDE 6---\nFONDO: cream\nBADGE: SIGUENOS\nTITULO: [frase de cierre]\nACCION 1: Guarda este post\nACCION 2: Comparte con alguien que lo necesite\nHANDLE: @naiu_ia\nPROGRESO: 6/6';

  const slides = await callClaude(prompt);
  await sendTelegram(chatId, slides);
  await saveToNotion(hook, data.date);
  delete pendingIdeas[chatId];
}

const server = http.createServer(function(req, res) {
  if (req.method === 'POST' && req.url === '/webhook/' + TELEGRAM_TOKEN) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', async function() {
      try {
        const update = JSON.parse(body);
        const msg = update.message;
        if (msg && msg.text) {
          const chatId = msg.chat.id.toString();
          const text = msg.text.trim();
          const num = parseInt(text);
          if (num >= 1 && num <= 5) {
            await generateSlides(chatId, num);
          } else if (text === '/ideas') {
            await sendDailyIdeas(chatId);
          } else {
            await sendTelegram(chatId, 'Escribe /ideas para recibir 5 ideas, o responde 1-5 para desarrollar una.');
          }
        }
      } catch(e) {
        console.error('Error webhook:', e);
      }
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(200);
    res.end('NAIU Bot corriendo');
  }
});

server.listen(PORT, function() {
  console.log('Bot corriendo en puerto ' + PORT);
});
