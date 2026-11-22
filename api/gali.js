const GEMINI_MODEL = "gemini-3.8-flash";

const responseSchema = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING" },
    phrase: { type: "STRING" },
    meaning: { type: "STRING" },
    tip: { type: "STRING" },
    chips: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["intro", "phrase", "meaning", "tip", "chips"],
};

function sendJson(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "Server belum memiliki GEMINI_API_KEY. Tambahkan di Vercel Environment Variables.",
    });
  }

  const body = req.body || {};
  const lang = body.lang === "id" ? "id" : "en";
  const history = Array.isArray(body.history) ? body.history : [];
  const contents = history.slice(-10).map((entry) => {
    const role = entry?.role === "model" ? "model" : "user";
    const parts = Array.isArray(entry?.parts)
      ? entry.parts
          .filter((part) => typeof part?.text === "string")
          .map((part) => ({ text: part.text.slice(0, 4000) }))
      : [];
    return { role, parts };
  }).filter((entry) => entry.parts.length > 0);

  if (!contents.length || !contents[contents.length - 1].parts[0].text.trim()) {
    return sendJson(res, 400, { error: "Pesan tidak boleh kosong." });
  }

  const systemPrompt = `You are Gali, a friendly, warm, and culturally savvy Indonesian language buddy on the Gaulingo website.
Help users speak natural everyday Indonesian AND Indonesian regional languages (Minang, Bali, Sunda, Bugis, Jawa, Batak, Betawi, Banjar, Papua, Makassar).
Current UI language is "${lang === "id" ? "Bahasa Indonesia" : "English"}". Write the "intro" and "tip" in ${lang === "id" ? "Bahasa Indonesia" : "simple English"}.
Always return valid JSON matching the schema:
- "intro": short friendly 1-sentence lead-in.
- "phrase": the exact natural Indonesian or regional phrase to speak out loud; keep it concise.
- "meaning": the translation enclosed in double quotes.
- "tip": one short practical cultural etiquette tip, politeness note, or pronunciation hint.
- "chips": array of 3 short follow-up button labels. First "Say it slower", second a regional translation option, third "Save phrase".`;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      },
    );

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Gemini upstream error:", result?.error?.message || upstream.status);
      return sendJson(res, 502, {
        error: result?.error?.message || "Gemini API gagal memproses permintaan.",
      });
    }

    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return sendJson(res, 502, { error: "Gemini mengirim jawaban kosong." });
    }

    const reply = JSON.parse(rawText);
    return sendJson(res, 200, { reply });
  } catch (error) {
    console.error("Gali API error:", error);
    return sendJson(res, 500, { error: "Terjadi kesalahan pada server Gali." });
  }
};
