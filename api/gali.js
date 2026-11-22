
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const responseSchema = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING" },
    phrase: { type: "STRING" },
    meaning: { type: "STRING" },
    tip: { type: "STRING" },
    chips: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: ["intro", "phrase", "meaning", "tip", "chips"]
};

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY belum dipasang di Vercel."
    });
  }

  const body = req.body || {};
  const lang = body.lang === "id" ? "id" : "en";

  // Batasi riwayat agar request lebih ringan.
  const history = Array.isArray(body.history)
    ? body.history.slice(-4)
    : [];

  const contents = history
    .map((entry) => {
      const role =
        entry?.role === "model" ? "model" : "user";

      const parts = Array.isArray(entry?.parts)
        ? entry.parts
            .filter((part) => typeof part?.text === "string")
            .map((part) => ({
              text: part.text.slice(0, 1200)
            }))
        : [];

      return { role, parts };
    })
    .filter((entry) => entry.parts.length > 0);

  if (
    !contents.length ||
    !contents[contents.length - 1].parts[0].text.trim()
  ) {
    return sendJson(res, 400, {
      error: "Pesan tidak boleh kosong."
    });
  }

  const systemPrompt = `
You are Gali, a friendly Indonesian language buddy on Gaulingo.

Help users learn natural everyday Indonesian and regional languages:
Minang, Bali, Sunda, Bugis, Jawa, Batak, Betawi, Banjar, Papua, and Makassar.

UI language: ${lang === "id" ? "Bahasa Indonesia" : "English"}.

Return valid JSON matching the provided schema.

Rules:
- intro: one short friendly sentence.
- phrase: one natural, useful phrase.
- meaning: short translation in double quotes.
- tip: one short cultural or pronunciation tip.
- chips: exactly 3 short follow-up labels.
- Keep every answer concise.
- Use ${lang === "id" ? "Bahasa Indonesia" : "simple English"} for intro and tip.
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  const startTime = Date.now();

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema
          }
        })
      }
    );

    const result = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error(
        "Gemini error:",
        upstream.status,
        result?.error?.message
      );

      return sendJson(res, 502, {
        error: "Gemini gagal memproses pesan."
      });
    }

    const rawText =
      result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return sendJson(res, 502, {
        error: "Gemini mengirim jawaban kosong."
      });
    }

    const reply = JSON.parse(rawText);

    console.log(
      "Gali response time:",
      Date.now() - startTime,
      "ms"
    );

    return sendJson(res, 200, { reply });

  } catch (error) {
    console.error("Gali API error:", error);

    if (error.name === "AbortError") {
      return sendJson(res, 504, {
        error: "Gali terlalu lama merespons. Coba lagi."
      });
    }

    return sendJson(res, 500, {
      error: "Terjadi kesalahan pada server Gali."
    });

  } finally {
    clearTimeout(timeout);
  }
};
