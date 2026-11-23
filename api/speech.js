const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function sendAudio(res, audio, mimeType, provider) {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(audio.length));
  res.setHeader("X-Gali-Audio-Provider", provider);
  return res.status(200).send(audio);
}

async function tryElevenLabs(text, rate, voiceId, keys) {
  let lastError = "ElevenLabs gagal tanpa detail";

  for (let index = 0; index < keys.length; index++) {
    try {
      const upstream = await fetch(
        `${ELEVENLABS_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": keys[index],
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              speed: Math.min(1.2, Math.max(0.7, Number(rate) || 1)),
            },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );

      if (upstream.ok) {
        const audio = Buffer.from(await upstream.arrayBuffer());
        if (audio.length) return { audio, provider: `elevenlabs-${index + 1}` };
      }

      const detail = await upstream.text().catch(() => "");
      lastError = `ElevenLabs (${upstream.status}): ${detail.slice(0, 200)}`;
      console.error(`ElevenLabs account ${index + 1} failed:`, lastError);

      if (![401, 402, 403, 429].includes(upstream.status) && upstream.status < 500) {
        break;
      }
    } catch (error) {
      lastError = `ElevenLabs request error: ${error.message}`;
      console.error(`ElevenLabs account ${index + 1} request failed:`, error.message);
    }
  }

  return { audio: null, lastError };
}

async function tryGeminiTts(text) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur di Vercel");

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Bacakan teks ini persis apa adanya tanpa tambahan kata: ${text.trim()}` }],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(40000),
    },
  );

  const result = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    throw new Error(result?.error?.message || `Gemini TTS HTTP ${upstream.status}`);
  }

  const audioPart = result?.candidates?.[0]?.content?.parts?.find(
    (part) =>
      part?.inlineData?.data &&
      part?.inlineData?.mimeType?.startsWith("audio/"),
  );

  if (!audioPart) throw new Error("Gemini TTS tidak mengembalikan audio");

  return {
    audio: Buffer.from(audioPart.inlineData.data, "base64"),
    mimeType: audioPart.inlineData.mimeType || "audio/wav",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const { text, rate = 1 } = req.body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 500) {
    return sendJson(res, 400, {
      error: "Teks audio tidak valid (maksimal 500 karakter).",
    });
  }

  const cleanText = text.trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();
  const keys = [
    process.env.ELEVENLABS_API_KEY_1,
    process.env.ELEVENLABS_API_KEY_2,
    process.env.ELEVENLABS_API_KEY,
  ]
    .map((k) => (k || "").trim())
    .filter(Boolean);

  let elevenError = "ELEVENLABS_VOICE_ID atau ELEVENLABS_API_KEY belum diisi di Vercel";

  if (voiceId && keys.length) {
    const elevenResult = await tryElevenLabs(cleanText, rate, voiceId, keys);
    if (elevenResult.audio) {
      return sendAudio(
        res,
        elevenResult.audio,
        "audio/mpeg",
        elevenResult.provider,
      );
    }
    elevenError = elevenResult.lastError;
  }

  try {
    const geminiResult = await tryGeminiTts(cleanText);
    return sendAudio(
      res,
      geminiResult.audio,
      geminiResult.mimeType,
      "gemini-tts",
    );
  } catch (error) {
    console.error("All Gali audio providers failed:", elevenError, "|", error.message);
    return sendJson(res, 502, {
      error: `${elevenError} | Fallback: ${error.message}`,
    });
  }
};
