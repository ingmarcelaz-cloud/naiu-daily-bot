const https = require("https");
const http = require("http");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = "33c91e9cb74c800ea6b4df4ec7d32787";
const PORT = process.env.PORT || 3000;

const DESIGN_SYSTEM = `
SISTEMA DE DISEÑO NAIU — REGLAS ESTRICTAS:

COLORES:
- Fondo claro: #fffbf3 (cream)
- Fondo oscuro: #1f3a33 (dark green)
- Acento rojo: #ff5353 — SOLO para: dot en badges, botón CTA circular, una palabra del título en slide 1, barra de progreso activa. NUNCA para fondos o textos largos.
- Verde medio: #2d5045 (cards en fondo oscuro)
- Texto muted claro: #5a7a6a
- Texto muted oscuro: #9fcfba

TIPOGRAFÍA:
- Título hero slide 1: Georgia serif italic, 38-44px, bold. UNA palabra clave en #ff5353 italic.
- Títulos sección: sans-serif bold, 22-28px
- Cuerpo: sans-serif 13-14px, máximo 60 palabras por slide
- Labels: sans-serif uppercase, 10-11px, letter-spacing 0.07em

COMPONENTES:
- Badge pill: esquinas redondeadas, dot rojo #ff5353, texto uppercase 11px
- Pro tip card: fondo #f0ece3 (en claro) o #2d5045 (en oscuro), border-radius 12px
- Botón CTA: círculo 34px, fondo #ff5353, flecha blanca →
- Barra de progreso: 3px altura, al fondo de cada slide, fill rojo indica slide actual/6
- Footer: @naiu_ia abajo izquierda, 12px, color muted

PATRÓN DE FONDOS (siempre este orden):
Slide 1: cream | Slide 2: cream | Slide 3: dark | Slide 4: cream | Slide 5: dark | Slide 6: cream

ESTRUCTURA DE CADA SLIDE:
1. Badge pill (arriba izquierda, categoría)
2. Título (serif italic hero en slide 1, sans-serif bold en el resto)
3. Contenido principal (pro tip card / lista / dato destacado)
4. Texto de apoyo opcional
5. Footer: @naiu_ia + barra de progreso

DIMENSIONES: 1080x1350px, ratio 4:5, border-radius 20px, padding 28-32px

TONO: directo, experto pero cercano, sin jerga. Audiencia: emprendedores colombianos.
`;

let pendingIdeas = {};

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error("Error Claude: " + JSON.stringify(parsed)));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendTelegram(chatId, message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown"
    });
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
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
        Estado: { select: { name: "Usada" } }
      }
    });
    const req = https.request({
      hostname: "api.notion.com",
      path: "/v1/pages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getUsedIdeas() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      filter: { property: "Estado", select: { equals: "Usada" } }
    });
    const req = https.request({
      hostname: "api.notion.com",
      path: `/v1/databases/${NOTION_DATABASE_ID}/query`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const parsed = JSON.parse(data);
        const ideas = parsed.results?.map(p =>
          p.properties?.Idea?.title?.[0]?.text?.content || ""
        ).filter(Boolean) || [];
        resolve(ideas);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendDailyIdeas(chatId) {
  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const usedIdeas = await getUsedIdeas();
  const usedSection = usedIdeas.length > 0
    ? `\nIDEAS YA USADAS (no repetir exactamente):\n${usedIdeas.slice(-10).join("\n")}\n`
    : "";

  const prompt = `Eres el cerebro estratega de contenido de NAIU, una agencia de IA colombiana.

AUDIENCIAS:
1. Empresarios que pierden horas en tareas repetitivas
2. Personas curiosas de IA que creen que es solo para programadores
${usedSection}
REGLA DE ORO — SLIDE LLEVATE ESTO:
Revelar herramienta real con nombre y que hace exactamente. SIN precios.
Terminar siempre con: "¿Esto te esta pasando? Comenta SI y hablamos"

Hoy es ${today}. Dame 5 ideas de carrusel:

Ideas NAIU — ${today}

1. HOOK: [frase potente]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + CTA]

2. HOOK: [frase potente]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + CTA]

3. HOOK: [frase potente]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + CTA]

4. HOOK: [frase potente]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + CTA]

5. HOOK: [frase potente]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + CTA]

Al final agrega: "_Responde con 1, 2, 3, 4 o 5 para desarrollar esa idea en slides_"`;

  const ideas = await callClaude(prompt);
  pendingIdeas[chatId] = { ideas, date: new Date().toISOString().split("T")[0] };
  await sendTelegram(chatId, ideas);
}

async function generateSlides(chatId, ideaNumber) {
  const data = pendingIdeas[chatId];
  if (!data) {
    await sendTelegram(chatId, "No hay ideas pendientes. Escribe /ideas para obtener nuevas.");
    return;
  }

  const lines = data.ideas.split("\n");
  const hookLine = lines.find(l => l.startsWith(`${ideaNumber}. HOOK:`));
  if (!hookLine) {
    await sendTelegram(chatId, "Número no válido. Responde con 1, 2, 3, 4 o 5.");
    return;
  }

  const hook = hookLine.replace(`${ideaNumber}. HOOK:`, "").trim();
  await sendTelegram(chatId, `Generando los 6 slides para:\n*"${hook}"*\n\nEspera un momento... ⏳`);

  const prompt = `Eres el generador de carruseles de NAIU (@naiu_ia).

${DESIGN_SYSTEM}

Genera exactamente 6 slides para este carousel.
HOOK: "${hook}"

Formato EXACTO para cada slide:

---SLIDE 1---
FONDO: cream (#fffbf3)
BADGE: [categoría en mayúsculas]
TITULO HERO: [título serif italic — una palabra clave en rojo]
SUBTITULO: [frase de apoyo, máx 10 palabras]
CTA BLOCK fondo oscuro: "Más en NAIU Newsletter →"
PROGRESO: 1/6

---SLIDE 2---
FONDO: cream (#fffbf3)
BADGE: [categoría]
TITULO: [título sección bold]
PUNTO 1: [máx 15 palabras]
PUNTO 2: [máx 15 palabras]
PUNTO 3: [máx 15 palabras]
PROGRESO: 2/6

---SLIDE 3---
FONDO: dark (#1f3a33)
BADGE: [categoría]
TITULO: [título impactante]
PRO TIP: [consejo concreto, máx 40 palabras]
PROGRESO: 3/6

---SLIDE 4---
FONDO: cream (#fffbf3)
BADGE: DATO CLAVE
NUMERO GRANDE: [estadística o número impactante]
CONTEXTO: [explicación breve, máx 20 palabras]
PROGRESO: 4/6

---SLIDE 5---
FONDO: dark (#1f3a33)
BADGE: HERRAMIENTA
TITULO: [nombre herramienta]
PASO 1: [acción concreta]
PASO 2: [acción concreta]
PASO 3: [acción concreta]
CTA: "¿Esto te está pasando? Comenta SÍ y hablamos"
PROGRESO: 5/6

---SLIDE 6---
FONDO: cream (#fffbf3)
BADGE: SÍGUENOS
TITULO: [frase de cierre poderosa]
ACCION 1: Guarda este post
ACCION 2: Comparte con alguien que lo necesite
HANDLE: @naiu_ia
PROGRESO: 6/6 (barra completa en rojo #ff5353)`;

  const slides = await callClaude(prompt);
  await sendTelegram(chatId, slides);
  await saveToNotion(hook, data.date);
  delete pendingIdeas[chatId];
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === `/webhook/${TELEGRAM_TOKEN}`) {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const update = JSON.parse(body);
        const msg = update.message;
        if (msg && msg.text) {
          const chatId = msg.chat.id.toString();
          const text = msg.text.trim();

          if ([1,2,3,4,5].includes(parseInt(text))) {
            await generateSlides(chatId, parseInt(text));
          } else if (text === "/ideas") {
            await sendDailyIdeas(chatId);
          } else {
            await sendTelegram(chatId, "Escribe /ideas para recibir 5 ideas, o responde 1-5 para desarrollar una.");
          }
        }
      } catch(e) {
        console.error("Error webhook:", e);
      }
      res.writeHead(200);
      res.end("OK");
    });
  } else {
    res.writeHead(200);
    res.end("NAIU Bot corriendo");
  }
});

server.listen(PORT, () => {
  console.log(`Bot corriendo en puerto ${PORT}`);
});
