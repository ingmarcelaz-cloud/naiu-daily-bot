const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
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
        const parsed = JSON.parse(data);
        resolve(parsed.content[0].text);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "Markdown" });
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
  const today = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const prompt = `Eres un asistente de IA para NAIU, una agencia de IA para empresarios colombianos.
Genera el mensaje diario de hoy (${today}) con este formato EXACTO usando emojis:

🤖 *NAIU Daily — ${today}*

📰 *Noticia del día:*
[Una noticia real y relevante de IA de esta semana, explicada en 2 líneas simples]

💡 *Truco del día con Claude:*
[Un tip práctico y específico para usar Claude en un negocio pequeño, con ejemplo concreto]

🎯 *Ejercicio de hoy:*
[Una tarea corta de 5 minutos que pueden hacer ahora mismo con Claude]

Sé concreto, práctico y en español colombiano. Sin introducciones, solo el mensaje.`;

  const message = await callClaude(prompt);
  await sendTelegram(message);
  console.log("✅ Mensaje enviado!");
}

main().catch(console.error);
