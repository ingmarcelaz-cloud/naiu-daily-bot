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
    if (parsed.content && parsed.content[0]) {
      resolve(parsed.content[0].text);
    } else {
      console.error("Respuesta inesperada:", JSON.stringify(parsed));
      reject(new Error("Respuesta inesperada de Claude: " + JSON.stringify(parsed)));
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
1. Empresarios que pierden horas en tareas repetitivas (métricas, correos, reportes, seguimiento de clientes)
2. Personas curiosas de IA que quieren aplicarla pero creen que es solo para programadores

REGLA DE ORO — SLIDE "LLÉVATE ESTO":
Cada idea DEBE revelar algo concreto que la persona no sepa que existe.
Herramientas reales: Make, n8n, AgentHub, Claude, Zapier, Notion AI, WhatsApp Business API.
SIEMPRE incluir: nombre de herramienta + qué hace exactamente + precio + tiempo de configuración.
NUNCA: consejos genéricos como "usa IA para tus correos".

ESTRUCTURA DE CADA CARRUSEL:
- Slide 1: Hook — dolor específico o verdad incómoda
- Slide 2: Confirmar el golpe — situación real y reconocible
- Slide 3: El dato — número concreto que genera urgencia
- Slide 4: El error real — creencia falsa que los tiene atascados
- Slide 5: Antes vs después — con números reales
- Slide 6: LLÉVATE ESTO — herramienta real, precio, tiempo de configuración
- Slide 7: Reencuadre — cambio de perspectiva
- Slide 8: CTA — una sola acción directa

TONO: Profesional, directo, sin relleno. Nunca motivacional. Como alguien que sabe y comparte lo que otros no cuentan.

Hoy es ${today}. Dame exactamente 5 ideas de carrusel para Instagram con este formato:

🧠 *Ideas NAIU — ${today}*

1️⃣ *[HOOK]*
💡 Por qué funciona: [dolor que toca]
🔧 Slide 6 será: [herramienta real + qué hace + precio]

2️⃣ *[HOOK]*
💡 Por qué funciona: [dolor que toca]
🔧 Slide 6 será: [herramienta real + qué hace + precio]

3️⃣ *[HOOK]*
💡 Por qué funciona: [dolor que toca]
🔧 Slide 6 será: [herramienta real + qué hace + precio]

4️⃣ *[HOOK]*
💡 Por qué funciona: [dolor que toca]
🔧 Slide 6 será: [herramienta real + qué hace + precio]

5️⃣ *[HOOK]*
💡 Por qué funciona: [dolor que toca]
🔧 Slide 6 será: [herramienta real + qué hace + precio]

_Respóndeme con el número de la idea que quieres desarrollar_ 🎯`;

  const ideas = await callClaude(prompt);
  await sendTelegram(ideas);
  console.log("✅ Ideas enviadas!");
}

main().catch(console.error);
