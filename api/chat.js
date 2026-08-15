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

const MODEL = "gpt-5.6-luna";

/* =====================================================
   REDIS
===================================================== */

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
    const text = await response.text();
    throw new Error(`Redis hatası: ${text}`);
  }

  return response.json();
}

/* =====================================================
   CONVERSATION
===================================================== */

function conversationKey(id) {
  return `asa:conversation:${id}`;
}

async function getConversation(conversationId) {
  const result = await redisCommand([
    "GET",
    conversationKey(conversationId),
  ]);

  const value = result?.result;

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

async function saveConversation(
  conversationId,
  messages
) {
  const cleanMessages = messages
    .filter(Boolean)
    .slice(-100);

  await redisCommand([
    "SET",
    conversationKey(conversationId),
    JSON.stringify(cleanMessages),
  ]);

  return cleanMessages;
}

async function deleteConversation(
  conversationId
) {
  if (!conversationId) {
    return;
  }

  await redisCommand([
    "DEL",
    conversationKey(conversationId),
  ]);
}

/* =====================================================
   MEMORY
===================================================== */

function emptyMemory() {
  return {
    user: {
      name: "Alperen",
    },

    facts: [],

    preferences: [],

    important: [],
  };
}

async function getMemory() {
  const result = await redisCommand([
    "GET",
    MEMORY_KEY,
  ]);

  const value = result?.result;

  if (!value) {
    return emptyMemory();
  }

  try {
    const parsed = JSON.parse(value);

    return {
      user:
        parsed.user || {
          name: "Alperen",
        },

      facts:
        Array.isArray(parsed.facts)
          ? parsed.facts
          : [],

      preferences:
        Array.isArray(parsed.preferences)
          ? parsed.preferences
          : [],

      important:
        Array.isArray(parsed.important)
          ? parsed.important
          : [],
    };
  } catch {
    return emptyMemory();
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
   MEMORY UPDATE
===================================================== */

async function updateMemory(
  currentMemory,
  userMessage
) {
  if (!userMessage) {
    return currentMemory;
  }

  try {
    const response =
      await openai.responses.create({
        model: MODEL,

        reasoning: {
          effort: "low",
        },

        instructions: `
Sen ASA'nın kalıcı hafıza yöneticisisin.

Kullanıcının adı Alperen.

Kullanıcının mesajından gelecekte
işe yarayabilecek KALICI kişisel bilgileri
tespit et.

Sadece gerçekten kalıcı ve yararlı
bilgileri kaydet.

Örnek:

"En sevdiğim renk siyah."
=> preferences

"Bir reklam dükkanım var."
=> facts

"Sevgilimin adı Sıla."
=> important

"Bugün işe geç kaldım."
=> kaydetme

"Şimdi çay içiyorum."
=> kaydetme

Sonucu SADECE geçerli JSON olarak döndür.

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

YENİ MESAJ:

${userMessage}
`,
      });

    const text =
      response.output_text || "{}";

    const cleaned =
      text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    const updates =
      JSON.parse(cleaned);

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
  } catch (error) {
    console.error(
      "MEMORY UPDATE ERROR:",
      error
    );

    return currentMemory;
  }
}

/* =====================================================
   MESSAGE NORMALIZATION
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
    .map((message) => {

      /*
        Normal text message
      */

      if (
        typeof message.content ===
        "string"
      ) {
        const text =
          message.content.trim();

        if (!text) {
          return null;
        }

        return {
          role: message.role,
          content: text,
        };
      }

      /*
        Multimodal message
      */

      if (
        Array.isArray(
          message.content
        )
      ) {
        const content =
          message.content.filter(
            (item) => {

              if (!item) {
                return false;
              }

              if (
                item.type ===
                "input_text"
              ) {
                return (
                  typeof item.text ===
                    "string" &&
                  item.text.trim()
                );
              }

              if (
                item.type ===
                "input_image"
              ) {
                return (
                  typeof item.image_url ===
                  "string"
                );
              }

              return false;
            }
          );

        if (!content.length) {
          return null;
        }

        return {
          role: message.role,
          content,
        };
      }

      return null;
    })
    .filter(Boolean);
}

/* =====================================================
   TEXT FOR MEMORY
===================================================== */

function extractTextFromMessage(
  message
) {
  if (!message) {
    return "";
  }

  if (
    typeof message.content ===
    "string"
  ) {
    return message.content;
  }

  if (
    Array.isArray(message.content)
  ) {
    return message.content
      .filter(
        (item) =>
          item?.type ===
          "input_text"
      )
      .map(
        (item) =>
          item.text || ""
      )
      .join(" ")
      .trim();
  }

  return "";
}

/* =====================================================
   ASA PERSONALITY
===================================================== */

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımsever ol.

Robot gibi konuşma.

Alperen'in konuşma tarzına uyum sağla.

Kısa sorulara kısa ve doğal cevap ver.

Karmaşık konularda yeterli açıklama yap.

Alperen günlük konuşuyorsa arkadaşça
ve doğal şekilde karşılık ver.

==============================
KALICI HAFIZA
==============================

Sana verilen kişisel hafızayı kullan.

Hafızada bulunan bilgileri kullanıcı
tekrar söylemeden kullanabilirsin.

Fakat hafızada olmayan bilgileri
uydurma.

Hafızayı gereksiz yere listeleme.

Bilgileri doğal şekilde kullan.

==============================
GÜNCEL BİLGİ
==============================

Güncel bilgi gerektiğinde web search kullan.

Özellikle:

- haber
- son dakika
- hava durumu
- döviz
- altın
- kripto
- borsa
- spor
- canlı skor
- maç
- fikstür
- ürün fiyatı
- teknoloji
- şirket haberleri
- siyasi gelişmeler
- ulaşım
- etkinlikler
- internet üzerindeki güncel bilgiler

gibi konularda güncel bilgi araştır.

Basit günlük konuşmalarda
gereksiz web araması yapma.

==============================
WEB
==============================

Web sonuçlarını olduğu gibi kopyalama.

Bilgiyi değerlendir.

Sonra Alperen'e doğal şekilde anlat.

Gereksiz kaynak listeleri oluşturma.

==============================
GÖRSELLER
==============================

Kullanıcı bir görsel gönderirse
görseli gerçekten incele.

Görselde gördüğün şeyleri
uydurmadan anlat.

Görsel net değilse bunu açıkça söyle.

Bir fotoğraf üzerinde soru sorulursa
doğrudan fotoğraf üzerinden cevap ver.

==============================
KONUŞMA
==============================

"selam"

"nasılsın?"

"ne yapıyorsun?"

"iyi geceler"

gibi mesajlarda doğal konuş.

Web kullanma.

==============================
ÜSLUP
==============================

Türkçe konuş.

Samimi ol.

Gereksiz tekrar yapma.

Gereksiz uzun cevaplar verme.

Emoji gerektiğinde kullan.

Alperen "ASA", "kanka", "patron"
gibi ifadeler kullanırsa doğal karşılık ver.
`;

/* =====================================================
   RESPONSE
===================================================== */

async function generateResponse(
  messages,
  memory
) {
  const instructions = `
${ASA_INSTRUCTIONS}

==============================
ALPEREN'İN KALICI HAFIZASI
==============================

${JSON.stringify(
  memory,
  null,
  2
)}

Hafızadaki bilgileri doğal şekilde kullan.

Hafızada olmayan kişisel bilgileri
uydurma.
`;

  const response =
    await openai.responses.create({
      model: MODEL,

      reasoning: {
        effort: "low",
      },

      instructions,

      tools: [
        {
          type: "web_search",
        },
      ],

      input: messages,

      truncation: "auto",
    });

  return response;
}

/* =====================================================
   NEW ID
===================================================== */

function createConversationId() {
  return (
    `chat-${Date.now()}-` +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

/* =====================================================
   API
===================================================== */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error:
        "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body =
      req.body || {};

    const action =
      body.action || "chat";

    /* =================================================
       DELETE
    ================================================= */

    if (
      action ===
      "deleteConversation"
    ) {
      const id =
        typeof body.conversationId ===
          "string"
          ? body.conversationId.trim()
          : "";

      if (!id) {
        return res.status(400).json({
          success: false,
          error:
            "conversationId gerekli.",
        });
      }

      await deleteConversation(id);

      return res.status(200).json({
        success: true,
        deleted: true,
        conversationId: id,
      });
    }

    /* =================================================
       NEW CONVERSATION
    ================================================= */

    if (
      action ===
      "newConversation" ||
      body.newConversation === true
    ) {
      const newId =
        createConversationId();

      return res.status(200).json({
        success: true,

        conversationId: newId,

        history: [],

        answer: "",

        newConversation: true,
      });
    }

    /* =================================================
       CONVERSATION ID
    ================================================= */

    const conversationId =
      typeof body.conversationId ===
        "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;

    /* =================================================
       HISTORY
    ================================================= */

    const oldMessages =
      await getConversation(
        conversationId
      );

    if (
      action === "getHistory" ||
      body.getHistory === true
    ) {
      return res.status(200).json({
        success: true,

        conversationId,

        history: oldMessages,

        answer: "",
      });
    }

    /* =================================================
       INCOMING
    ================================================= */

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

    /* =================================================
       COMBINE
    ================================================= */

    const combinedMessages = [
      ...oldMessages,
      ...incomingMessages,
    ].slice(-100);

    /* =================================================
       LAST USER MESSAGE
    ================================================= */

    const lastUserMessage =
      [
        ...incomingMessages,
      ]
        .reverse()
        .find(
          (message) =>
            message.role === "user"
        );

    /* =================================================
       MEMORY
    ================================================= */

    let memory =
      await getMemory();

    const memoryText =
      extractTextFromMessage(
        lastUserMessage
      );

    if (memoryText) {
      memory =
        await updateMemory(
          memory,
          memoryText
        );
    }

    /* =================================================
       GENERATE
    ================================================= */

    const response =
      await generateResponse(
        combinedMessages,
        memory
      );

    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";

    /* =================================================
       SAVE
    ================================================= */

    combinedMessages.push({
      role: "assistant",

      content: answer,
    });

    const savedMessages =
      await saveConversation(
        conversationId,
        combinedMessages
      );

    /* =================================================
       RESULT
    ================================================= */

    return res.status(200).json({
      success: true,

      conversationId,

      answer,

      history: savedMessages,

      memory,

      responseId: response.id,

      model: MODEL,
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
