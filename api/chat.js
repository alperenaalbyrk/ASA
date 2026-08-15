import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MEMORY_KEY = "asa:memory";

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;


// =====================================================
// REDIS KOMUTU
// =====================================================

async function redisCommand(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Redis bağlantısı bulunamadı.");
  }

  const response = await fetch(REDIS_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(
      `Redis hatası: ${response.status}`
    );
  }

  return response.json();
}


// =====================================================
// HAFIZA OKU
// =====================================================

async function getMemory() {
  try {
    const data = await redisCommand([
      "GET",
      MEMORY_KEY,
    ]);

    if (!data.result) {
      return {};
    }

    return JSON.parse(data.result);

  } catch (error) {
    console.error(
      "HAFIZA OKUMA HATASI:",
      error
    );

    return {};
  }
}


// =====================================================
// HAFIZA KAYDET
// =====================================================

async function saveMemory(memory) {
  try {
    await redisCommand([
      "SET",
      MEMORY_KEY,
      JSON.stringify(memory),
    ]);
  } catch (error) {
    console.error(
      "HAFIZA KAYDETME HATASI:",
      error
    );
  }
}


// =====================================================
// API
// =====================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {

    const { messages } =
      req.body || {};

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error:
          "Mesaj geçmişi gönderilmedi.",
      });
    }


    // =================================================
    // HAFIZA
    // =================================================

    const memory =
      await getMemory();


    // =================================================
    // SON 12 MESAJ
    // =================================================

    const recentMessages =
      messages.slice(-12);


    // =================================================
    // ASA + HAFIZA
    // =================================================

    const response =
      await openai.responses.create({

        model: "gpt-5",

        instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sıcak ve yardımcı ol.

Kısa ve net cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

KALICI HAFIZA:

${JSON.stringify(
  memory,
  null,
  2
)}

HAFIZA KURALLARI:

- Hafızadaki bilgiler doğrudur.
- Eski sohbet mesajları hafızanın önüne geçemez.
- Kullanıcı yeni bir bilgi verirse yeni bilgi önceliklidir.
- Kullanıcı mevcut bir bilgisini değiştirirse eski bilgiyi
  yeni bilgiyle güncelle.
- Hafızada olmayan bilgileri uydurma.
- Kullanıcı "benim hakkımda ne biliyorsun?" derse
  hafızadaki bilgileri kullan.
- Gereksiz uzun cevap verme.

ÖNEMLİ:

Kullanıcı açıkça kalıcı bir kişisel bilgi verirse,
cevabının sonunda aşağıdaki özel formatta bir hafıza
güncellemesi üret.

Normal cevap:

{
  "answer": "normal ASA cevabı",
  "memory_update": {
    "key": "deger"
  }
}

Eğer hafızaya kaydedilecek bilgi yoksa:

{
  "answer": "normal ASA cevabı",
  "memory_update": {}
}

Örnek:

Kullanıcı:
"En sevdiğim yemek kebap."

Çıktı:

{
  "answer": "Tamam Alperen, kebabı sevdiğini hatırlayacağım.",
  "memory_update": {
    "favoriteFood": "kebap"
  }
}

Başka açıklama yazma.
`,

        input: recentMessages,

        text: {
          format: {
            type: "json_schema",

            name: "asa_response",

            strict: true,

            schema: {
              type: "object",

              properties: {

                answer: {
                  type: "string",
                },

                memory_update: {
                  type: "object",

                  additionalProperties: {
                    type: "string",
                  },
                },
              },

              required: [
                "answer",
                "memory_update",
              ],

              additionalProperties: false,
            },
          },
        },
      });


    // =================================================
    // CEVABI OKU
    // =================================================

    let result;

    try {

      result =
        JSON.parse(
          response.output_text
        );

    } catch {

      return res.status(200).json({
        answer:
          response.output_text ||
          "Şu anda cevap oluşturamadım.",
      });

    }


    // =================================================
    // HAFIZA GÜNCELLE
    // =================================================

    if (
      result.memory_update &&
      typeof result.memory_update ===
        "object"
    ) {

      const updates =
        result.memory_update;

      const keys =
        Object.keys(updates);

      if (keys.length > 0) {

        const updatedMemory = {
          ...memory,
          ...updates,
        };

        await saveMemory(
          updatedMemory
        );
      }
    }


    // =================================================
    // CEVAP
    // =================================================

    return res.status(200).json({
      answer:
        result.answer ||
        "Şu anda cevap oluşturamadım.",
    });


  } catch (error) {

    console.error(
      "ASA API HATASI:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "ASA bağlantısında hata oluştu.",
    });
  }
}
