import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MEMORY_KEY = "asa:memory";

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

async function saveMemory(memory) {
  try {
    await fetch(
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
  } catch (error) {
    console.error("HAFIZA KAYDETME HATASI:", error);
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

    // Mevcut hafızayı getir
    let memory = await getMemory();

    // Son kullanıcı mesajını bul
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    const userText = lastUserMessage?.content || "";

    /*
     * 1) Kullanıcının yeni bir kişisel bilgi verip vermediğini belirle.
     */
    const memoryResponse = await openai.responses.create({
      model: "gpt-5",

      instructions: `
Sen ASA'nın hafıza yöneticisisin.

Kullanıcı hakkında kalıcı olabilecek kişisel bilgileri tespit et.

Özellikle şu alanları takip et:

- fullName
- favoriteColor
- favoriteGame
- girlfriendName
- favoriteFood
- assistantNameMeaning

Kurallar:

1. Kullanıcı yeni bir bilgi verirse onu güncelle.
2. Kullanıcı eski bilgisini değiştirirse eski bilgiyi yenisiyle değiştir.
3. Kullanıcı bir bilgiyi açıkça silerse o alanı null yap.
4. Kullanıcı bilgi vermediyse hiçbir alanı değiştirme.
5. Tahminde bulunma.
6. Sadece açıkça söylenen bilgileri kaydet.

Mevcut hafıza:

${JSON.stringify(memory, null, 2)}

Kullanıcının son mesajı:

${userText}
`,

      input: "Hafızayı analiz et.",
      
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
            additionalProperties: false
          }
        }
      }
    });

    /*
     * Modelin döndürdüğü hafıza güncellemesini oku.
     */
    try {
      const update = JSON.parse(memoryResponse.output_text);

      for (const key of Object.keys(update)) {
        if (update[key] !== null) {
          memory[key] = update[key];
        }
      }

      await saveMemory(memory);
    } catch (memoryError) {
      console.error("HAFIZA GÜNCELLEME HATASI:", memoryError);
    }

    /*
     * 2) ASA'nın normal cevabını oluştur.
     */
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

Aşağıdaki bilgiler kalıcı hafızanda bulunmaktadır.
Cevap verirken gerektiğinde bunları kullan.

HAFIZA:

${JSON.stringify(memory, null, 2)}

Önemli:

- Hafızadaki bilgileri doğru kabul et.
- Kullanıcı yeni bir bilgi verirse yeni bilgi önceliklidir.
- Eski bilgi ile yeni bilgi çelişirse yeni bilgiyi kullan.
- Bilmediğin bir şeyi biliyormuş gibi söyleme.
- Kullanıcı "benim hakkımda ne biliyorsun?" diye sorarsa hafızadaki bilgileri listele.
`,

      input: messages,
    });

    return res.status(200).json({
      answer: response.output_text,
      memory,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error: error.message || "Bilinmeyen hata",
    });
  }
}
