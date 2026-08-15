import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MEMORY_KEY = "asa:memory";

// =====================================================
// REDIS'TEN HAFIZAYI OKU
// =====================================================

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

// =====================================================
// REDIS'E HAFIZAYI KAYDET
// =====================================================

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

// =====================================================
// ANA API
// =====================================================

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

    // =================================================
    // MEVCUT KALICI HAFIZAYI AL
    // =================================================

    const currentMemory = await getMemory();

    // Son kullanıcı mesajını bul
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    const userText = lastUserMessage?.content || "";

    // =================================================
    // HAFIZA YÖNETİCİSİ
    // =================================================

    const memoryResponse = await openai.responses.create({
      model: "gpt-5",

      instructions: `
Sen ASA'nın hafıza yöneticisisin.

Görevin, kullanıcının SON MESAJINDA açıkça verdiği
kalıcı kişisel bilgileri tespit etmek ve mevcut hafızayı
güncellemektir.

TAKİP EDİLEN BİLGİLER:

- fullName
- favoriteColor
- favoriteGame
- girlfriendName
- favoriteFood
- assistantNameMeaning

MEVCUT KALICI HAFIZA:

${JSON.stringify(currentMemory, null, 2)}

SON KULLANICI MESAJI:

${userText}

KURALLAR:

1. Kullanıcı son mesajında yeni bir kişisel bilgi verirse
   mevcut bilgiyi yeni bilgiyle değiştir.

2. Kullanıcı mevcut bilgisini değiştirirse eski bilgiyi
   kesinlikle koruma.

   Örnek:
   Mevcut:
   favoriteFood = "İskender"

   Kullanıcı:
   "Artık en sevdiğim yemek kebap."

   Sonuç:
   favoriteFood = "kebap"

3. Kullanıcı son mesajında belirli bir bilgi hakkında
   hiçbir şey söylemiyorsa mevcut değeri değiştirme.

4. Eski sohbet mesajlarına bakarak yeni bilgi üretme.

5. Tahmin yapma.

6. Kullanıcının açıkça söylemediği hiçbir bilgiyi kaydetme.

7. Bir bilgi mevcut hafızada varsa ve kullanıcı o bilgiyi
   son mesajında değiştirmediyse aynen koru.

8. Kullanıcı bir bilgiyi açıkça unutmanı/silmeni isterse
   o alanı null yap.

9. Çıktıda bütün alanları mutlaka gönder.

10. Son kullanıcı mesajı hafıza ile çelişiyorsa,
    kullanıcının SON MESAJI önceliklidir.

Ama eski sohbet geçmişindeki mesajlar hafızayı değiştiremez.
Sadece SON KULLANICI MESAJI yeni bilgi kaynağıdır.
`,

      input: "Mevcut hafızayı son kullanıcı mesajına göre güncelle.",

      text: {
        format: {
          type: "json_schema",

          name: "asa_memory",

          strict: true,

          schema: {
            type: "object",

            properties: {
              fullName: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
              },

              favoriteColor: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
              },

              favoriteGame: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
              },

              girlfriendName: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
              },

              favoriteFood: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
              },

              assistantNameMeaning: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "null"
                  }
                ]
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

    // =================================================
    // YENİ HAFIZAYI OLUŞTUR
    // =================================================

    let updatedMemory = {
      ...currentMemory
    };

    try {
      const memoryUpdate = JSON.parse(
        memoryResponse.output_text
      );

      for (const key of Object.keys(memoryUpdate)) {
        const value = memoryUpdate[key];

        if (value === null) {
          delete updatedMemory[key];
        } else {
          updatedMemory[key] = value;
        }
      }

      await saveMemory(updatedMemory);

    } catch (error) {
      console.error(
        "HAFIZA JSON OKUMA HATASI:",
        error
      );
    }

    // =================================================
    // NORMAL ASA CEVABI
    // =================================================

    const response = await openai.responses.create({
      model: "gpt-5",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal ve yardımcı ol.

Kendini gerektiğinde "ASA" olarak tanıt.

Kısa, net ve doğal cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

==================================================
KALICI HAFIZA
==================================================

${JSON.stringify(updatedMemory, null, 2)}

==================================================
ÇOK ÖNEMLİ HAFIZA KURALLARI
==================================================

1. KALICI HAFIZA, kullanıcı hakkındaki temel bilgiler
   için ana kaynaktır.

2. Sohbet geçmişindeki eski bilgiler KALICI HAFIZANIN
   önüne geçemez.

3. Örneğin hafızada:

   favoriteColor = "siyah"

   varsa ve eski sohbet geçmişinde "kırmızı" yazıyorsa,
   kullanıcının favori rengi SIYAHTIR.

4. Kullanıcı mevcut mesajında yeni bir bilgi verirse,
   yeni bilgi önceliklidir.

5. Kullanıcı "en sevdiğim renk ne?" diye sorarsa,
   önce KALICI HAFIZAYA bak.

6. Hafızada favoriteColor varsa doğrudan onu kullan.

7. Hafızada bilgi yoksa:
   "Bunu henüz bilmiyorum." de.

8. Eski sohbet mesajlarından tahmin ederek eksik hafızayı
   doldurma.

9. Kullanıcı "benim hakkımda ne biliyorsun?" derse
   yalnızca KALICI HAFIZADAKİ bilgileri kullan.

10. Kullanıcı daha önce söylediği bir bilgiyi değiştirdiyse
    yalnızca yeni bilgiyi kullan.

11. Kullanıcı yeni bilgi verdiğinde eski bilgiyi cevapta
    tekrar etme.

12. Bilmediğin şeyi biliyormuş gibi söyleme.

==================================================
ASA KİMLİĞİ
==================================================

Sen ASA'sın.

ASA ismi:
Alperen + Sıla + Albayrak

Kullanıcı bunu daha önce kaydettiyse hafızadaki değeri kullan.
`,

      input: messages,
    });

    // =================================================
    // CEVAP
    // =================================================

    return res.status(200).json({
      answer: response.output_text,
      memory: updatedMemory,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "ASA bağlantısında bilinmeyen bir hata oluştu.",
    });
  }
}
