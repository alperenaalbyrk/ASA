import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN;

const DEFAULT_CONVERSATION = "alperen-main";
const MEMORY_KEY = "asa:memory:alperen";

/* =====================================================
   REDIS
===================================================== */

async function redisCommand(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      "Redis bağlantısı bulunamadı."
    );
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
    const text = await response.text();
    throw new Error(`Redis hatası: ${text}`);
  }

  return response.json();
}

/* =====================================================
   KONUŞMA
===================================================== */

async function getConversation(conversationId) {
  const result = await redisCommand([
    "GET",
    `asa:conversation:${conversationId}`,
  ]);

  const value = result?.result;

  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveConversation(
  conversationId,
  messages
) {
  const cleanMessages = messages
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
    )
    .slice(-100);

  await redisCommand([
    "SET",
    `asa:conversation:${conversationId}`,
    JSON.stringify(cleanMessages),
  ]);

  return cleanMessages;
}

async function deleteConversation(conversationId) {
  await redisCommand([
    "DEL",
    `asa:conversation:${conversationId}`,
  ]);
}

/* =====================================================
   KALICI ASA HAFIZASI
===================================================== */

async function getMemory() {
  const result = await redisCommand([
    "GET",
    MEMORY_KEY,
  ]);

  const value = result?.result;

  if (!value) {
    return {
      user: {
        name: "Alperen",
      },
      facts: [],
      preferences: [],
      important: [],
    };
  }

  try {
    const parsed = JSON.parse(value);

    return {
      user: parsed.user || {
        name: "Alperen",
      },
      facts: Array.isArray(parsed.facts)
        ? parsed.facts
        : [],
      preferences: Array.isArray(
        parsed.preferences
      )
        ? parsed.preferences
        : [],
      important: Array.isArray(parsed.important)
        ? parsed.important
        : [],
    };
  } catch {
    return {
      user: {
        name: "Alperen",
      },
      facts: [],
      preferences: [],
      important: [],
    };
  }
}

async function saveMemory(memory) {
  await redisCommand([
    "SET",
    MEMORY_KEY,
    JSON.stringify(memory),
  ]);

  return memory;
}

/* =====================================================
   MESAJ NORMALİZASYONU
===================================================== */

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        (message.role === "user" ||
          message.role === "assistant")
    )
    .map((message) => ({
      role: message.role,
      content: String(
        message.content || ""
      ).trim(),
    }))
    .filter(
      (message) =>
        message.content.length > 0
    );
}

/* =====================================================
   ASA KİŞİLİĞİ
===================================================== */

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımsever ol.

Robot gibi konuşma.

Alperen'in tarzına uyum sağla.

Kısa sorulara gereksiz uzun cevaplar verme.

Fakat konu önemli veya karmaşıksa
yeterli açıklama yap.

Alperen sana günlük konuşma yapıyorsa
doğal bir arkadaş gibi konuş.

==============================
KİŞİSEL HAFIZA
==============================

Sana verilen kişisel hafızayı bağlam olarak kullan.

Bir bilgi hafızada varsa Alperen tekrar
söylemeden kullanabilirsin.

Örneğin Alperen'in sevdiği bir şey,
daha önce verdiği bir bilgi veya
önceki konuşmada belirttiği tercih
hafızada bulunuyorsa buna göre cevap ver.

Hafızadaki bilgileri kullanıcıya
gereksiz yere listeleme.

Doğal şekilde kullan.

Hafızada olmayan bir şeyi kesin bilgi
gibi uydurma.

==============================
GÜNCEL BİLGİ
==============================

Bilgi güncelse web araştırması kullan.

Özellikle:

- hava durumu
- haberler
- son dakika
- döviz
- altın
- kripto
- borsa
- spor
- canlı skor
- maçlar
- fikstür
- ürün fiyatları
- teknoloji
- şirket haberleri
- siyasi gelişmeler
- ulaşım
- etkinlikler
- tarih
- saat
- internet üzerindeki güncel bilgiler

gibi konularda güncel araştırma yap.

Ancak basit günlük konuşmalarda
gereksiz web araştırması yapma.

==============================
WEB SONUÇLARINI YORUMLAMA
==============================

Web sonuçlarını olduğu gibi kopyalama.

Önce bilgiyi değerlendir.

Sonra Alperen'e anlaşılır şekilde aktar.

Mümkün olduğunda:

1. Durum
2. Önemli detay
3. ASA'nın değerlendirmesi

şeklinde doğal bir yapı kullan.

Örneğin:

"Durum şu..."

"Önemli nokta..."

"Benim yorumum..."

şeklinde konuşabilirsin.

Sadece haber başlıklarını arka arkaya
dizme.

==============================
HABERLER
==============================

Alperen "bugünün haberleri",
"son dakika", "dünyada ne oluyor"
gibi bir şey sorarsa güncel araştırma yap.

Önemli haberleri seç.

Gereksiz ayrıntıları ele.

Haberin neden önemli olduğunu
mümkün olduğunda açıkla.

==============================
SPOR
==============================

Skor, maç, fikstür veya canlı sonuç
sorulursa güncel araştırma yap.

Eski bilgiyi güncelmiş gibi gösterme.

==============================
HAVA DURUMU
==============================

Şehir belirtilmişse o şehir için
güncel hava durumunu araştır.

Sadece sıcaklığı değil,
gerekiyorsa yağış, rüzgar ve
günün genel durumunu da özetle.

==============================
KONUŞMA
==============================

Kullanıcı:

"nasılsın?"
"ne yapıyorsun?"
"selam"
"iyi geceler"

gibi günlük konuşma yapıyorsa
web kullanma.

Doğal cevap ver.

==============================
CEVAP STİLİ
==============================

Türkçe konuş.

Samimi ol.

Gereksiz tekrar yapma.

Kullanıcının sorusunu tekrar ederek
cevaba başlama.

Alperen'in kişisel asistanı gibi davran.

Emoji gerektiğinde kullanabilirsin
ama abartma.

Kullanıcı "ASA", "kanka", "chat"
gibi ifadeler kullanırsa doğal şekilde
karşılık verebilirsin.
`;

/* =====================================================
   HAFIZA GÜNCELLEME
===================================================== */

async function updateMemory(
  currentMemory,
  userMessage
) {
  if (!userMessage) {
    return currentMemory;
  }

  const memoryResponse =
    await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen bir kişisel AI hafıza yöneticisisin.

Kullanıcının adı Alperen.

Aşağıdaki kullanıcı mesajından gelecekte
işe yarayabilecek kalıcı kişisel bilgileri çıkar.

Sadece gerçekten önemli olan bilgileri kaydet.

Örnek:

- isim
- sevdiği şeyler
- tercihleri
- önemli kişisel bilgiler
- projeleri
- kullandığı sistemler
- önemli alışkanlıklar
- asistanıyla ilgili tercihleri

Günlük ve geçici şeyleri kaydetme.

Örneğin:
"Bugün çay içtim" -> kaydetme.

"En sevdiğim renk siyah" -> kaydet.

Sonucu SADECE JSON olarak döndür.

Format:

{
  "facts": [],
  "preferences": [],
  "important": []
}
`,

      input: `
MEVCUT HAFIZA:

${JSON.stringify(
  currentMemory,
  null,
  2
)}

YENİ KULLANICI MESAJI:

${userMessage}
`,
    });

  try {
    const text =
      memoryResponse.output_text || "{}";

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const updates = JSON.parse(cleaned);

    const memory = {
      ...currentMemory,

      facts: [
        ...new Set([
          ...(currentMemory.facts || []),
          ...(Array.isArray(updates.facts)
            ? updates.facts
            : []),
        ]),
      ].slice(-100),

      preferences: [
        ...new Set([
          ...(currentMemory.preferences || []),
          ...(Array.isArray(
            updates.preferences
          )
            ? updates.preferences
            : []),
        ]),
      ].slice(-100),

      important: [
        ...new Set([
          ...(currentMemory.important || []),
          ...(Array.isArray(
            updates.important
          )
            ? updates.important
            : []),
        ]),
      ].slice(-100),
    };

    await saveMemory(memory);

    return memory;
  } catch {
    return currentMemory;
  }
}

/* =====================================================
   API
===================================================== */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error:
        "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body = req.body || {};

    const conversationId =
      typeof body.conversationId ===
        "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;

    /* ================================================
       YENİ SOHBET
    ================================================ */

    if (body.newConversation === true) {
      const newId =
        `chat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      return res.status(200).json({
        success: true,
        conversationId: newId,
        history: [],
        answer: "",
        newConversation: true,
      });
    }

    /* ================================================
       GEÇMİŞİ GETİR
    ================================================ */

    const oldMessages =
      await getConversation(
        conversationId
      );

    if (
      body.getHistory === true &&
      (!body.messages ||
        !Array.isArray(body.messages) ||
        body.messages.length === 0)
    ) {
      return res.status(200).json({
        success: true,
        conversationId,
        history: oldMessages,
        answer: "",
      });
    }

    /* ================================================
       GELEN MESAJLAR
    ================================================ */

    const incomingMessages =
      normalizeMessages(
        body.messages
      );

    if (
      incomingMessages.length === 0
    ) {
      return res.status(200).json({
        success: true,
        conversationId,
        history: oldMessages,
        answer: "",
      });
    }

    /* ================================================
       KONUŞMA BİRLEŞTİR
    ================================================ */

    let combinedMessages = [
      ...oldMessages,
    ];

    for (const message of incomingMessages) {
      const alreadyExists =
        combinedMessages.some(
          (oldMessage) =>
            oldMessage.role ===
              message.role &&
            oldMessage.content ===
              message.content
        );

      if (!alreadyExists) {
        combinedMessages.push(
          message
        );
      }
    }

    combinedMessages =
      combinedMessages.slice(-100);

    /* ================================================
       SON KULLANICI MESAJI
    ================================================ */

    const lastUserMessage =
      [...incomingMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "user"
        );

    /* ================================================
       KALICI HAFIZA
    ================================================ */

    let memory =
      await getMemory();

    if (lastUserMessage) {
      memory =
        await updateMemory(
          memory,
          lastUserMessage.content
        );
    }

    /* ================================================
       ASA'YA VERİLECEK TALİMAT
    ================================================ */

    const finalInstructions = `
${ASA_INSTRUCTIONS}

==============================
ALPEREN'İN KALICI HAFIZASI
==============================

${JSON.stringify(
  memory,
  null,
  2
)}

Bu hafızayı doğal şekilde kullan.

Hafızadaki bilgileri uydurma veya değiştirme.
`;

    /* ================================================
       GPT-5.6
    ================================================ */

    const response =
      await openai.responses.create({
        model: "gpt-5.6",

        instructions:
          finalInstructions,

        tools: [
          {
            type: "web_search",
          },
        ],

        input: combinedMessages,

        truncation: "auto",
      });

    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";

    /* ================================================
       CEVABI KONUŞMAYA EKLE
    ================================================ */

    combinedMessages.push({
      role: "assistant",
      content: answer,
    });

    /* ================================================
       REDIS'E KAYDET
    ================================================ */

    const savedMessages =
      await saveConversation(
        conversationId,
        combinedMessages
      );

    /* ================================================
       RESPONSE
    ================================================ */

    return res.status(200).json({
      success: true,

      conversationId,

      answer,

      history: savedMessages,

      memory,

      responseId: response.id,
    });
  } catch (error) {
    console.error(
      "ASA API HATASI:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "ASA API'de bilinmeyen bir hata oluştu.",
    });
  }
}
