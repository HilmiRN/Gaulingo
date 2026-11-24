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

function collectKeys(prefix, listVarName) {
  const fromList = (process.env[listVarName] || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const fromEnv = Object.keys(process.env)
    .filter((name) => name === prefix || name.startsWith(`${prefix}_`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => (process.env[name] || "").trim())
    .filter(Boolean);

  return [...new Set([...fromList, ...fromEnv])];
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
  let lastError = "ElevenLabs gagal";

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
          signal: AbortSignal.timeout(20000),
        },
      );

      if (upstream.ok) {
        const audio = Buffer.from(await upstream.arrayBuffer());
        if (audio.length) return { audio, provider: `elevenlabs-${index + 1}` };
      }

      const detail = await upstream.text().catch(() => "");
      lastError = `ElevenLabs #${index + 1} (${upstream.status}): ${detail.slice(0, 150)}`;
      if (![401, 402, 403, 429].includes(upstream.status) && upstream.status < 500) {
        break;
      }
    } catch (error) {
      lastError = `ElevenLabs #${index + 1} error: ${error.message}`;
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
      signal: AbortSignal.timeout(30000),
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

async function tryGeminiMultiKeys(text, keys) {
  let lastError = "GEMINI_API_KEY belum diisi";

  for (let index = 0; index < keys.length; index++) {
    try {
      const clean = text.trim();
      const firstTry = await requestGeminiAudio(keys[index], clean);
      if (firstTry) return { ...firstTry, provider: `gemini-tts-${index + 1}` };

      const secondTry = await requestGeminiAudio(keys[index], `Say aloud: "${clean}"`);
      if (secondTry) return { ...secondTry, provider: `gemini-tts-${index + 1}` };
    } catch (error) {
      lastError = `Gemini #${index + 1}: ${error.message}`;
    }
  }

  throw new Error(lastError);
}

async function tryFreeGoogleTts(text) {
  const snippet = text.slice(0, 200);
  const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=id&dt=t&q=${encodeURIComponent(snippet)}`;
  const upstream = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!upstream.ok) throw new Error(`Google TTS HTTP ${upstream.status}`);
  const audio = Buffer.from(await upstream.arrayBuffer());
  if (!audio.length) throw new Error("Google TTS kosong");

  return { audio, mimeType: "audio/mpeg", provider: "google-free-tts" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const { text, rate = 1 } = req.body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 500) {
    return sendJson(res, 400, {
      error: "Teks audio nggak valid (maksimal 500 karakter).",
    });
  }

  const cleanText = text.trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();
  const elevenKeys = collectKeys("ELEVENLABS_API_KEY", "ELEVENLABS_API_KEYS");
  const geminiKeys = collectKeys("GEMINI_API_KEY", "GEMINI_API_KEYS");

  let errors = [];

  // Urutan 1: Semua akun ElevenLabs (berapapun jumlahnya)
  if (voiceId && elevenKeys.length) {
    const elevenResult = await tryElevenLabs(cleanText, rate, voiceId, elevenKeys);
    if (elevenResult.audio) {
      return sendAudio(res, elevenResult.audio, "audio/mpeg", elevenResult.provider);
    }
    errors.push(elevenResult.lastError);
  }

  // Urutan 2: Semua akun Gemini TTS (berapapun jumlahnya)
  if (geminiKeys.length) {
    try {
      const geminiResult = await tryGeminiMultiKeys(cleanText, geminiKeys);
      return sendAudio(res, geminiResult.audio, geminiResult.mimeType, geminiResult.provider);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Urutan 3: Cadangan Google TTS gratis tanpa API key
  try {
    const freeResult = await tryFreeGoogleTts(cleanText);
    return sendAudio(res, freeResult.audio, freeResult.mimeType, freeResult.provider);
  } catch (error) {
    errors.push(error.message);
  }

  return sendJson(res, 502, {
    error: errors.join(" | ") || "Semua server audio lagi penuh.",
  });
};
