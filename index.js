const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = "33c91e9cb74c800ea6b4df4ec7d32787";

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
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

async function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: CHAT_ID,
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

async function saveToNotion(ideas) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split("T")[0];
    const body = JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Idea: { title: [{ text: { content: ideas.substring(0, 200) } }] },
        Fecha: { date: { start: today } },
        Estado: { select: { name: "Pendiente" } }
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

async function main() {
  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const usedIdeas = await getUsedIdeas();
  const usedSection = usedIdeas.length > 0 
    ? `\nIDEAS YA USADAS (no repetir exactamente):\n${usedIdeas.join("\n")}\n` 
    : "";

  const prompt = `Eres el cerebro estratega de contenido de NAIU, una agencia de IA colombiana.

AUDIENCIAS:
1. Empresarios que pierden horas en tareas repetitivas
2. Personas curiosas de IA que creen que es solo para programadores
${usedSection}
REGLA DE ORO — SLIDE LLEVATE ESTO:
Revelar herramienta real con nombre y que hace exactamente. SIN precios.
Terminar siempre con CTA que genere conversacion:
"¿Esto te esta pasando? Comenta SI y hablamos"

Hoy es ${today}. Dame 5 ideas de carrusel:

Ideas NAIU — ${today}

1. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + CTA]

2. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + CTA]

3. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + CTA]

4. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + CTA]

5. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta
