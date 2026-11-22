const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts";

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
  let lastStatus = 0;

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

      lastStatus = upstream.status;
      const detail = await upstream.text().catch(() => "");
      console.error(`ElevenLabs account ${index + 1} failed:`, lastStatus, detail.slice(0, 300));

      // Try the other account for quota, authentication, rate-limit, and server errors.
      if (![401, 402, 403, 429].includes(lastStatus) && lastStatus < 500) break;
    } catch (error) {
      console.error(`ElevenLabs account ${index + 1} request failed:`, error.message);
      lastStatus = 502;
    }
  }

  return { audio: null, lastStatus };
}

async function tryGeminiTts(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Read this text aloud clearly and naturally, with accurate Indonesian or multilingual pronunciation. Speak only the transcript, without adding or translating anything.\n\n${text}` }] }],
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
    console.error("Gemini TTS failed:", upstream.status, result?.error?.message);
    throw new Error(result?.error?.message || `Gemini TTS HTTP ${upstream.status}`);
  }

  const audioPart = result?.candidates?.[0]?.content?.parts?.find(
    (part) => part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith("audio/"),
  );
  if (!audioPart) {
    console.error("Gemini TTS returned no audio:", JSON.stringify(result).slice(0, 500));
    throw new Error("Gemini TTS did not return audio data");
  }

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
    return sendJson(res, 400, { error: "Teks audio tidak valid (maksimal 500 karakter)." });
  }

  const cleanText = text.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const keys = [process.env.ELEVENLABS_API_KEY_1, process.env.ELEVENLABS_API_KEY_2].filter(Boolean);

  // Priority 1 and 2: the two independent ElevenLabs accounts.
  if (voiceId && keys.length) {
    const elevenResult = await tryElevenLabs(cleanText, rate, voiceId, keys);
    if (elevenResult.audio) {
      return sendAudio(res, elevenResult.audio, "audio/mpeg", elevenResult.provider);
    }
  } else {
    console.warn("ElevenLabs credentials or voice ID missing; proceeding to Gemini TTS fallback.");
  }

  // Priority 3: Gemini TTS. The browser receives a WAV file and can play it normally.
  try {
    const geminiResult = await tryGeminiTts(cleanText);
    return sendAudio(res, geminiResult.audio, geminiResult.mimeType, "gemini-tts");
  } catch (error) {
    console.error("All Gali audio providers failed:", error.message);
    return sendJson(res, 502, {
      error: "ElevenLabs dan Gemini Audio sedang tidak tersedia. Jawaban teks tetap bisa digunakan.",
    });
  }
};
