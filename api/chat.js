import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Redis / Upstash ayarları
const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const MEMORY_KEY = "asa:memory";

/**
 * Redis'ten ASA'nın kalıcı hafızasını getirir.
 */
async function getMemory() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("Redis environment variables eksik.");
    return {};
  }

  try {
    const response = await fetch(
      `${REDIS_URL}/get/${encodeURIComponent(MEMORY_KEY)}`,
      {
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Redis GET hatası: ${response.status}`);
    }

    const data = await response.json();

    if (!data.result) {
      return {};
    }

    if (typeof data.result === "object") {
      return data.result;
    }

    return JSON.parse(data.result);
  } catch (error) {
    console.error("Hafıza okuma hatası:", error);
    return {};
  }
}

/**
 * ASA'nın hafızasını Redis'e kaydeder.
 */
async function saveMemory(memory) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("Redis environment variables eksik.");
    return;
  }

  try {
    const value = JSON.stringify(memory);

    const response = await fetch(
      `${REDIS_URL}/set/${encodeURIComponent(MEMORY_KEY)}/${encodeURIComponent(
        value
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Redis SET hatası: ${response.status}`);
    }
  } catch (error) {
    console.error("Hafıza kayıt hatası:", error);
  }
}

/**
 * Kullanıcının mesajından kalıcı olarak hatırlanması
 * gereken kişisel bilgileri çıkarır.
 */
async function extractMemory(userMessage) {
  try {
    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'nın hafıza yöneticisisin.

Kullanıcının adı Alperen.

Görevin, kullanıcının mesajından gelecekte de
işe yarayacak kalıcı kişisel bilgileri tespit etmektir.

SADECE gerçekten kalıcı ve kişisel bilgileri kaydet.

Örnekler:
- En sevdiğim renk mor.
- En sevdiğim oyun God of War.
- Ben reklam işi yapıyorum.
- Çay dükkanım var.
- Sıla benim kız arkadaşım.
- En sevdiğim takım Galatasaray.
- Bilgisayarımın ekran kartı RTX 4070.

Bunlar kaydedilebilir.

Şunları kaydetme:
- Bugün hava çok sıcak.
- Şu an acıktım.
- Birazdan işe gideceğim.
- Bugün moralim bozuk.
- Merhaba.
- Nasılsın?
- Geçici günlük konuşmalar.

ÖNEMLİ:
Kullanıcı açıkça "hatırla" demese bile,
mesaj kalıcı bir kişisel bilgi içeriyorsa kaydet.

Çıktıyı SADECE geçerli JSON olarak ver.

Eğer kaydedilecek bilgi yoksa:
{}

Eğer bilgi varsa örnek:
{
  "favorite_color": "mor"
}

Başka açıklama yazma.
`,

      input: userMessage,
    });

    const text = response.output_text?.trim();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      console.error("Hafıza JSON olarak okunamadı:", text);
      return {};
    }
  } catch (error) {
    console.error("Hafıza analiz hatası:", error);
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Mesaj geçmişi gönderilmedi.",
      });
    }

    // Son kullanıcı mesajını bul
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message?.role === "user");

    const userText =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content
        : "";

    // Mevcut kalıcı hafızayı getir
    const memory = await getMemory();

    // ASA'nın cevabını oluştur
    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.
Türkçe konuş.
Samimi, doğal ve yardımcı ol.
Kendini ASA olarak tanıt.
Kısa ve anlaşılır cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Sana gönderilen messages dizisi önceki konuşma geçmişidir.
Önceki mesajları dikkate al ve konuşmanın bağlamını koru.

Aşağıdaki bilgiler ASA'nın kalıcı hafızasıdır.
Cevap verirken gerektiğinde bunları kullan:

${JSON.stringify(memory, null, 2)}

Hafızadaki bilgileri kullanıcı sormadan gereksiz yere
listeleme.

Bir bilgi hafızada varsa onu biliyormuş gibi doğal şekilde kullan.
`,

      input: messages,
    });

    const answer =
      response.output_text || "Şu anda cevap oluşturamadım.";

    // Yeni kişisel bilgi var mı kontrol et
    if (userText) {
      const newMemory = await extractMemory(userText);

      if (
        newMemory &&
        typeof newMemory === "object" &&
        Object.keys(newMemory).length > 0
      ) {
        const updatedMemory = {
          ...memory,
          ...newMemory,
        };

        await saveMemory(updatedMemory);

        console.log("ASA HAFIZASI GÜNCELLENDİ:", updatedMemory);
      }
    }

    return res.status(200).json({
      answer,
    });
  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error: error.message || "Bilinmeyen hata",
    });
  }
}
