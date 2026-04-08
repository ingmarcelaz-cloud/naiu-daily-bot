const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
          console.log("Respuesta Claude:", JSON.stringify(parsed));
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error("Error Claude: " + JSON.stringify(parsed)));
          }
        } catch(e) {
          reject(e);
        }
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

async function main() {
  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const prompt = `Eres el cerebro estratega de contenido de NAIU, una agencia de IA colombiana.

AUDIENCIAS:
1. Empresarios que pierden horas en tareas repetitivas
2. Personas curiosas de IA que creen que es solo para programadores

REGLA DE ORO — SLIDE LLEVATE ESTO:
REGLA DE ORO — SLIDE LLEVATE ESTO:
Siempre revelar herramienta real con nombre y que hace exactamente. SIN precios.
Al final de la slide 6 siempre terminar con un CTA que genere conversacion:
"¿Esto te esta pasando? Comenta SI y hablamos" 
o
"¿Quieres implementar esto en tu negocio? Escribeme por DM"
o similar — directo, sin prometer guias ni materiales.

Hoy es ${today}. Dame 5 ideas de carrusel con este formato:

Ideas NAIU — ${today}

1. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + precio]

2. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + precio]

3. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + precio]

4. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + precio]

5. HOOK: [frase que duela o sorprenda]
Por que funciona: [dolor especifico]
Slide 6: [herramienta real + que hace + precio]

Respondeme con el numero de la idea que quieres desarrollar.`;

  const ideas = await callClaude(prompt);
  await sendTelegram(ideas);
  console.log("Mensaje enviado!");
}

main().catch(console.error);
