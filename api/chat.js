import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const MEMORY_KEY = "asa:memory";


// =====================================================
// REDIS - HAFIZAYI OKU
// =====================================================

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


// =====================================================
// REDIS - HAFIZAYI KAYDET
// =====================================================

async function saveMemory(memory) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("Redis environment variables eksik.");
    return;
  }

  try {
    const value = JSON.stringify(memory);

    const response = await fetch(
      `${REDIS_URL}/set/${encodeURIComponent(
        MEMORY_KEY
      )}/${encodeURIComponent(value)}`,
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

    console.log("ASA hafızası kaydedildi.");
  } catch (error) {
    console.error("Hafıza kayıt hatası:", error);
  }
}


// =====================================================
// YENİ BİLGİLERİ HAFIZADAN ÇIKAR
// =====================================================

async function analyzeMemory(userMessage, currentMemory) {
  try {
    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'nın hafıza yöneticisisin.

Kullanıcının adı Alperen.

Görevin, kullanıcının mesajını analiz ederek
kalıcı kişisel bilgileri tespit etmektir.

Kullanıcı açıkça "hatırla" demese bile,
kalıcı ve önemli bir kişisel bilgi söylüyorsa kaydet.

Hafıza kategorileri:

profile:
Kullanıcının temel kişisel bilgileri.

preferences:
Sevdiği/sevmediği şeyler.

relationships:
Önemli kişiler ve ilişkiler.

work:
İş, meslek, çalışma hayatı.

games:
Oyunlar ve oyun tercihleri.

other:
Diğer önemli kalıcı bilgiler.

ÖRNEK:

Kullanıcı:
"Benim en sevdiğim renk siyah."

Çıktı:

{
  "action": "update",
  "memory": {
    "preferences": {
      "favorite_color": "siyah"
    }
  }
}

Kullanıcı:
"En sevdiğim oyun God of War."

Çıktı:

{
  "action": "update",
  "memory": {
    "games": {
      "favorite_game": "God of War"
    }
  }
}

Kullanıcı:
"Ben reklam işi yapıyorum."

Çıktı:

{
  "action": "update",
  "memory": {
    "work": {
      "occupation": "reklam işi"
    }
  }
}

Kullanıcı:
"Sıla benim kız arkadaşım."

Çıktı:

{
  "action": "update",
  "memory": {
    "relationships": {
      "girlfriend": "Sıla"
    }
  }
}

Kullanıcı:
"Artık en sevdiğim renk mavi."

Bu durumda eski rengi güncelle:

{
  "action": "update",
  "memory": {
    "preferences": {
      "favorite_color": "mavi"
    }
  }
}

Kullanıcı:
"En sevdiğim rengi unut."

Bu durumda:

{
  "action": "delete",
  "path": "preferences.favorite_color"
}

Geçici konuşmaları kaydetme.

Örneğin:

"Bugün yoruldum."
"Şimdi işe gidiyorum."
"Hava çok sıcak."
"Birazdan yemek yiyeceğim."

Bunlar hafızaya girmemeli.

Eğer mesajda kalıcı bilgi yoksa:

{
  "action": "none"
}

SADECE geçerli JSON döndür.

Mevcut hafıza:

${JSON.stringify(currentMemory, null, 2)}
`,

      input: userMessage,
    });

    const text = response.output_text?.trim();

    if (!text) {
      return { action: "none" };
    }

    try {
      return JSON.parse(text);
    } catch {
      console.error("Hafıza JSON hatası:", text);
      return { action: "none" };
    }
  } catch (error) {
    console.error("Hafıza analiz hatası:", error);
    return { action: "none" };
  }
}


// =====================================================
// NOKTA NOTASYONUYLA SİLME
// =====================================================

function deletePath(object, path) {
  const parts = path.split(".");

  let current = object;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      return;
    }

    current = current[parts[i]];
  }

  delete current[parts[parts.length - 1]];
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


    // -------------------------------------------------
    // MEVCUT HAFIZA
    // -------------------------------------------------

    const memory = await getMemory();


    // -------------------------------------------------
    // SON KULLANICI MESAJI
    // -------------------------------------------------

    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message?.role === "user");

    const userText =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content
        : "";


    // -------------------------------------------------
    // ASA CEVABI
    // -------------------------------------------------

    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.
Samimi, doğal ve yardımcı ol.
Kendini ASA olarak tanıt.
Gereksiz uzun cevaplar verme.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Sana gönderilen messages dizisi konuşma geçmişidir.
Konuşmanın bağlamını koru.

Ayrıca aşağıdaki bilgiler ASA'nın kalıcı hafızasıdır:

${JSON.stringify(memory, null, 2)}

Hafızadaki bilgileri gerektiğinde doğal şekilde kullan.

Örneğin hafızada:

{
  "preferences": {
    "favorite_color": "siyah"
  }
}

varsa kullanıcı:

"En sevdiğim renk ne?"

diye sorduğunda:

"En sevdiğin renk siyah, Alperen. 🖤"

şeklinde cevap ver.

Kullanıcı "Benim hakkımda neler biliyorsun?"
diye sorarsa hafızadaki önemli bilgileri
kategorilere ayırarak özetleyebilirsin.

Hafızada olmayan bir şeyi biliyormuş gibi uydurma.
`,

      input: messages,
    });

    const answer =
      response.output_text || "Şu anda cevap oluşturamadım.";


    // -------------------------------------------------
    // HAFIZA ANALİZİ
    // -------------------------------------------------

    if (userText) {
      const memoryResult = await analyzeMemory(
        userText,
        memory
      );


      // -------------------------------------------------
      // YENİ BİLGİ
      // -------------------------------------------------

      if (memoryResult.action === "update") {
        const newMemory = memoryResult.memory || {};

        const updatedMemory = {
          ...memory,

          ...newMemory,

          profile: {
            ...(memory.profile || {}),
            ...(newMemory.profile || {}),
          },

          preferences: {
            ...(memory.preferences || {}),
            ...(newMemory.preferences || {}),
          },

          relationships: {
            ...(memory.relationships || {}),
            ...(newMemory.relationships || {}),
          },

          work: {
            ...(memory.work || {}),
            ...(newMemory.work || {}),
          },

          games: {
            ...(memory.games || {}),
            ...(newMemory.games || {}),
          },

          other: {
            ...(memory.other || {}),
            ...(newMemory.other || {}),
          },
        };

        await saveMemory(updatedMemory);

        console.log(
          "ASA HAFIZASI GÜNCELLENDİ:",
          updatedMemory
        );
      }


      // -------------------------------------------------
      // BİLGİ SİLME
      // -------------------------------------------------

      if (memoryResult.action === "delete") {
        const updatedMemory = {
          ...memory,
        };

        if (memoryResult.path) {
          deletePath(
            updatedMemory,
            memoryResult.path
          );
        }

        await saveMemory(updatedMemory);

        console.log(
          "ASA HAFIZASINDAN SİLİNDİ:",
          memoryResult.path
        );
      }
    }


    // -------------------------------------------------
    // CEVABI GÖNDER
    // -------------------------------------------------

    return res.status(200).json({
      answer,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Bilinmeyen hata",
    });
  }
}
