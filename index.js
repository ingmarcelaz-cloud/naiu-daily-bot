const https = require('https');
const http = require('http');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = '33c91e9cb74c800ea6b4df4ec7d32787';
const PORT = process.env.PORT || 3000;

let pendingIdeas = {};

async function callClaude(prompt) {
  return new Promise(function(resolve, reject) {
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
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error('Error: ' + JSON.stringify(parsed)));
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
  return new Promise(function(resolve, reject) {
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
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(JSON.parse(data)); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function saveToNotion(hook, date) {
  return new Promise(function(resolve, reject) {
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
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUsedIdeas() {
  return new Promise(function(resolve) {
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
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const parsed = JSON.parse(data);
          const ideas = parsed.results ? parsed.results.map(function(p) {
            return p.properties && p.properties.Idea && p.properties.Idea.title && p.properties.Idea.title[0] ? p.properties.Idea.title[0].text.content : '';
          }).filter(Boolean) : [];
          resolve(ideas);
        } catch(e) { resolve([]); }
      });
    });
    req.on('error', function() { resolve([]); });
    req.write(body);
    req.end();
  });
}

async function sendDailyIdeas(chatId) {
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const usedIdeas = await getUsedIdeas();
  const usedSection = usedIdeas.length > 0 ? 'IDEAS YA USADAS (no repetir exactamente):\n' + usedIdeas.slice(-10).join('\n') + '\n\n' : '';

  const prompt = 'Eres el cerebro estratega de NAIU, agencia de IA colombiana.\n\n' +
    'AUDIENCIAS:\n' +
    '1. Empresarios que pierden horas en tareas repetitivas: metricas, correos, reportes, seguimiento de clientes\n' +
    '2. Personas curiosas de IA que creen que es solo para programadores\n\n' +
    usedSection +
    'REGLA DE ORO PARA SLIDE 6:\n' +
    'Revelar herramienta real con nombre y que hace exactamente. SIN precios.\n' +
    'Terminar SIEMPRE con: Esto te esta pasando? Comenta SI y hablamos\n' +
    'NUNCA consejos genericos.\n\n' +
    'EJEMPLOS BUENOS DE SLIDE 6:\n' +
    '- Make conecta tu Gmail con Claude y responde correos automaticamente. Sin tocar nada. Esto te esta pasando? Comenta SI y hablamos\n' +
    '- n8n revisa tus ventas cada lunes y manda resumen directo al Telegram. Esto te esta pasando? Comenta SI y hablamos\n' +
    '- AgentHub maneja WhatsApp, Instagram y correo desde un solo lugar. Esto te esta pasando? Comenta SI y hablamos\n\n' +
    'TONO: Directo, profesional, sin relleno. Como alguien que sabe y comparte lo que otros no cuentan. Nada motivacional.\n\n' +
    'Hoy es ' + today + '. Dame EXACTAMENTE 5 ideas con este formato:\n\n' +
    '1. HOOK: [frase que duela o sorprenda]\n' +
    'Por que funciona: [dolor especifico]\n' +
    'Slide 6: [herramienta real + que hace + CTA]\n\n' +
    '2. HOOK: [frase que duela o sorprenda]\n' +
    'Por que funciona: [dolor especifico]\n' +
    'Slide 6: [herramienta real + que hace + CTA]\n\n' +
    '3. HOOK: [frase que duela o sorprenda]\n' +
    'Por que funciona: [dolor especifico]\n' +
    'Slide 6: [herramienta real + que hace + CTA]\n\n' +
    '4. HOOK: [frase que duela o sorprenda]\n' +
    'Por que funciona: [dolor especifico]\n' +
    'Slide 6: [herramienta real + que hace + CTA]\n\n' +
    '5. HOOK: [frase que duela o sorprenda]\n' +
    'Por que funciona: [dolor especifico]\n' +
    'Slide 6: [herramienta real + que hace + CTA]\n\n' +
    'Al final escribe exactamente esta linea: Responde con 1, 2, 3, 4 o 5 para desarrollar esa idea en slides';

  const ideas = await callClaude(prompt);
  pendingIdeas[chatId] = { ideas: ideas, date: new Date().toISOString().split('T')[0] };
  await sendTelegram(chatId, ideas);
}

async function generateSlides(chatId, ideaNumber) {
  const data = pendingIdeas[chatId];
  if (!data) {
    await sendTelegram(chatId, 'Escribe /ideas para obtener nuevas ideas primero.');
    return;
  }

  const lines = data.ideas.split('\n');
  const hookLine = lines.find(function(l) {
    const clean = l.trim();
    return clean.startsWith(ideaNumber + '. HOOK:') ||
           clean.startsWith(ideaNumber + ') HOOK:') ||
           clean.includes('## ' + ideaNumber + '. HOOK:') ||
           clean.includes('##' + ideaNumber + '. HOOK:');
  });

  if (!hookLine) {
    await sendTelegram(chatId, 'Escribe /ideas primero y luego responde con 1, 2, 3, 4 o 5.');
    return;
  }

  const hook = hookLine.replace(/^.*HOOK:\s*/, '').replace(/"/g, '').trim();
  await sendTelegram(chatId, 'Generando los 6 slides para:\n"' + hook + '"\n\nEspera un momento...');

  const slidesPrompt = 'Eres el generador de carruseles de NAIU (@naiu_ia). Tu trabajo es generar los 6 slides DIRECTAMENTE sin hacer preguntas ni pedir mas informacion.\n\n' +
    'SISTEMA DE DISENO NAIU:\n' +
    '- Colores: fondo claro #fffbf3, fondo oscuro #1f3a33, acento rojo #ff5353\n' +
    '- Patron de fondos obligatorio: Slide1=cream, Slide2=cream, Slide3=dark, Slide4=cream, Slide5=dark, Slide6=cream\n' +
    '- Slide 1: titulo hero serif italic bold, UNA palabra en rojo #ff5353\n' +
    '- Resto de slides: sans-serif bold para titulos\n' +
    '- Maximo 60 palabras por slide\n' +
    '- Badge pill arriba izquierda con dot rojo en cada slide\n' +
    '- Footer: @naiu_ia + barra de progreso en cada slide\n' +
    '- Dimensiones: 1080x1350px ratio 4:5\n\n' +
    'HOOK DEL CAROUSEL: "' + hook + '"\n\n' +
    'Genera EXACTAMENTE este formato sin variaciones:\n\n' +
    '---SLIDE 1---\n' +
    'FONDO: cream (#fffbf3)\n' +
    'BADGE: [categoria en mayusculas]\n' +
    'TITULO HERO: [titulo serif italic - marca UNA palabra en ROJO]\n' +
    'SUBTITULO: [max 10 palabras]\n' +
    'CTA BLOCK: Mas en NAIU Newsletter\n' +
    'PROGRESO: 1/6\n\n' +
    '---SLIDE 2---\n' +
    'FONDO: cream (#fffbf3)\n' +
    'BADGE: [categoria]\n' +
    'TITULO: [titulo bold]\n' +
    'PUNTO 1: [max 15 palabras]\n' +
    'PUNTO 2: [max 15 palabras]\n' +
    'PUNTO 3: [max 15 palabras]\n' +
    'PROGRESO: 2/6\n\n' +
    '---SLIDE 3---\n' +
    'FONDO: dark (#1f3a33)\n' +
    'BADGE: [categoria]\n' +
    'TITULO: [titulo impactante]\n' +
    'PRO TIP: [consejo concreto max 40 palabras]\n' +
    'PROGRESO: 3/6\n\n' +
    '---SLIDE 4---\n' +
    'FONDO: cream (#fffbf3)\n' +
    'BADGE: DATO CLAVE\n' +
    'NUMERO GRANDE: [estadistica o numero impactante]\n' +
    'CONTEXTO: [max 20 palabras]\n' +
    'PROGRESO: 4/6\n\n' +
    '---SLIDE 5---\n' +
    'FONDO: dark (#1f3a33)\n' +
    'BADGE: HERRAMIENTA\n' +
    'TITULO: [nombre herramienta]\n' +
    'QUE HACE: [descripcion concreta]\n' +
    'PASO 1: [accion]\n' +
    'PASO 2: [accion]\n' +
    'PASO 3: [accion]\n' +
    'CTA: Esto te esta pasando? Comenta SI y hablamos\n' +
    'PROGRESO: 5/6\n\n' +
    '---SLIDE 6---\n' +
    'FONDO: cream (#fffbf3)\n' +
    'BADGE: SIGUENOS\n' +
    'TITULO: [frase de cierre poderosa]\n' +
    'ACCION 1: Guarda este post\n' +
    'ACCION 2: Comparte con alguien que lo necesite\n' +
    'HANDLE: @naiu_ia\n' +
    'PROGRESO: 6/6';

  const slides = await callClaude(slidesPrompt);
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
            await sendTelegram(chatId, 'Escribe /ideas para recibir 5 ideas, luego responde 1-5 para desarrollar una.');
          }
        }
      } catch(e) {
        console.error('Error:', e);
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
