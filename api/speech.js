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

function pcmToWav(pcmBuffer, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
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
      if (![401, 402, 403, 429].includes(upstream.status) && upstream.status < 500) {
        break;
      }
    } catch (error) {
      lastError = `ElevenLabs request error: ${error.message}`;
    }
  }

  return { audio: null, lastError };
}

async function requestGeminiAudio(apiKey, promptText) {
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptText }] }],
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

  if (!audioPart) return null;

  const rawBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const mime = audioPart.inlineData.mimeType || "";
  const rateMatch = mime.match(/rate=(\d+)/i);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

  const isAlreadyWav = rawBuffer.slice(0, 4).toString("ascii") === "RIFF";
  return {
    audio: isAlreadyWav ? rawBuffer : pcmToWav(rawBuffer, sampleRate),
    mimeType: "audio/wav",
  };
}

async function tryGeminiTts(text) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur di Vercel");

  const clean = text.trim();
  const firstTry = await requestGeminiAudio(apiKey, clean);
  if (firstTry) return firstTry;

  const secondTry = await requestGeminiAudio(apiKey, `Say aloud: "${clean}"`);
  if (secondTry) return secondTry;

  throw new Error("Gemini TTS tidak mengembalikan audio");
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

  let elevenError = "ElevenLabs belum dikonfigurasi";

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
    return sendJson(res, 502, {
      error: `${elevenError} | Fallback: ${error.message}`,
    });
  }
};
