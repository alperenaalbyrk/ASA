import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MEMORY_KEY = "asa:memory";

// ===============================
// HAFIZAYI OKU
// ===============================
async function getMemory() {
  try {
    const response = await fetch(
      `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(MEMORY_KEY)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Redis okuma hatası:", response.status);
      return {};
    }

    const data = await response.json();

    if (!data.result) {
      return {};
    }

    return JSON.parse(data.result);
  } catch (error) {
    console.error("HAFIZA OKUMA HATASI:", error);
    return {};
  }
}

// ===============================
// HAFIZAYI KAYDET
// ===============================
async function saveMemory(memory) {
  try {
    const response = await fetch(
      `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(MEMORY_KEY)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(memory),
      }
    );

    if (!response.ok) {
      console.error("Redis kaydetme hatası:", response.status);
    }
  } catch (error) {
    console.error("HAFIZA KAYDETME HATASI:", error);
  }
}

// ===============================
// API
// ===============================
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

    // Mevcut hafızayı getir
    const oldMemory = await getMemory();

    // Son kullanıcı mesajını bul
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    const userText = lastUserMessage?.content || "";

    // ===============================
    // 1. HAFIZA ANALİZİ
    // ===============================
    const memoryResponse = await openai.responses.create({
      model: "gpt-5",

      instructions: `
Sen ASA'nın hafıza yöneticisisin.

Kullanıcı hakkında açıkça söylenen ve gelecekte hatırlanması
faydalı olan kalıcı kişisel bilgileri tespit et.

Takip edilen alanlar:

- fullName
- favoriteColor
- favoriteGame
- girlfriendName
- favoriteFood
- assistantNameMeaning

MEVCUT HAFIZA:
${JSON.stringify(oldMemory, null, 2)}

KULLANICININ SON MESAJI:
${userText}

KURALLAR:

1. Kullanıcı yeni bir bilgi verirse o bilgiyi kaydet.
2. Kullanıcı mevcut bir bilgiyi değiştirirse eski bilgiyi yenisiyle değiştir.
3. Kullanıcı açıkça bir bilgiyi silmek isterse o alanı null yap.
4. Kullanıcı bir alan hakkında hiçbir şey söylemiyorsa mevcut değeri koru.
5. Tahminde bulunma.
6. Kullanıcının söylediği bilgiyi aynen ve doğru şekilde aktar.
`,

      input: "Hafıza güncellemesini oluştur.",

      text: {
        format: {
          type: "json_schema",
          name: "asa_memory_update",
          strict: true,

          schema: {
            type: "object",

            properties: {
              fullName: {
                type: ["string", "null"]
              },

              favoriteColor: {
                type: ["string", "null"]
              },

              favoriteGame: {
                type: ["string", "null"]
              },

              girlfriendName: {
                type: ["string", "null"]
              },

              favoriteFood: {
                type: ["string", "null"]
              },

              assistantNameMeaning: {
                type: ["string", "null"]
              }
            },

            required: [
              "fullName",
              "favoriteColor",
              "favoriteGame",
              "girlfriendName",
              "favoriteFood",
              "assistantNameMeaning"
            ],

            additionalProperties: false
          }
        }
      }
    });

    // ===============================
    // 2. HAFIZAYI GÜNCELLE
    // ===============================
    try {
      const update = JSON.parse(memoryResponse.output_text);

      const newMemory = {
        ...oldMemory
      };

      for (const key of Object.keys(update)) {
        // null ise kullanıcı o bilgiyi silmek istemiş olabilir
        if (update[key] === null) {
          if (Object.prototype.hasOwnProperty.call(oldMemory, key)) {
            delete newMemory[key];
          }
        } else {
          newMemory[key] = update[key];
        }
      }

      await saveMemory(newMemory);

      // Cevap oluştururken güncel hafızayı kullan
      Object.assign(oldMemory, newMemory);

    } catch (memoryError) {
      console.error("HAFIZA GÜNCELLEME HATASI:", memoryError);
    }

    // ===============================
    // 3. ASA'NIN NORMAL CEVABI
    // ===============================
    const response = await openai.responses.create({
      model: "gpt-5",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.
Türkçe konuş.
Samimi, doğal ve yardımcı ol.
Kendini ASA olarak tanıt.
Kısa ve anlaşılır cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

KALICI HAFIZAN:

${JSON.stringify(oldMemory, null, 2)}

Kurallar:

- Hafızadaki bilgileri gerektiğinde kullan.
- Kullanıcı yeni bir bilgi verdiyse güncel bilgiyi kullan.
- Eski ve yeni bilgi çelişiyorsa yeni bilgi doğrudur.
- Bilmediğin bir şeyi uydurma.
- Kullanıcı "benim hakkımda ne biliyorsun?" derse hafızandaki bilgileri listele.
`,

      input: messages,
    });

    return res.status(200).json({
      answer: response.output_text,
      memory: oldMemory,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error: error.message || "Bilinmeyen hata",
    });
  }
}
