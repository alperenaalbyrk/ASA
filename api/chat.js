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
   MEMORY
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

      important: Array.isArray(
        parsed.important
      )
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
   NORMALIZE
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
   ASA
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

Gereksiz tekrar yapma.

Alperen sana günlük konuşma yapıyorsa
arkadaşça ve doğal cevap ver.

==============================
KALICI HAFIZA
==============================

Sana verilen kalıcı hafızayı kullan.

Hafızada bulunan bilgileri Alperen
tekrar söylemeden kullanabilirsin.

Ancak hafızada olmayan bilgileri
uydurma.

Hafızadaki bilgileri gereksiz yere
listeleme.

Doğal şekilde kullan.

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
- ürün fiyatları
- teknoloji
- şirketler
- siyasi gelişmeler
- ulaşım
- etkinlikler
- güncel internet bilgileri

konularında güncel araştırma yap.

Basit günlük konuşmalarda web araması yapma.

==============================
WEB KULLANIMI
==============================

Web sonuçlarını olduğu gibi kopyalama.

Bilgileri değerlendir.

Sonra Alperen'e doğal şekilde aktar.

Gerekiyorsa:

Durum:
...

Önemli nokta:
...

ASA'nın yorumu:
...

şeklinde anlat.

==============================
SPOR
==============================

Skor, maç, fikstür veya canlı sonuç
sorulursa güncel bilgi araştır.

Eski bilgiyi güncelmiş gibi gösterme.

==============================
HAVA
==============================

Şehir belirtilmişse güncel hava
durumunu araştır.

Gerekiyorsa sıcaklık, yağış ve
rüzgarı belirt.

==============================
KONUŞMA
==============================

"Selam"
"Nasılsın?"
"Ne yapıyorsun?"
"İyi geceler"

gibi günlük konuşmalarda
web kullanma.

Doğal cevap ver.

==============================
TAVIR
==============================

Samimi ol.

Zeki ol.

Gereksiz resmi konuşma.

Gereksiz uzun cevaplar verme.

Emoji kullanabilirsin fakat abartma.

Alperen "ASA", "kanka" veya
"chat" gibi ifadeler kullanırsa
doğal karşılık ver.
`;


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
    const memoryResponse =
      await openai.responses.create({
        model: "gpt-5.6-luna",

        instructions: `
Sen ASA'nın kişisel hafıza yöneticisisin.

Kullanıcı Alperen.

Yeni mesajdan gelecekte işe yarayabilecek
kalıcı kişisel bilgileri çıkar.

Sadece gerçekten kalıcı ve önemli
bilgileri kaydet.

Örnek:

"Bugün çay içtim"
→ kaydetme.

"En sevdiğim renk siyah"
→ kaydet.

"Şu projeyi yapıyorum"
→ kaydet.

"Şu uygulamayı kullanıyorum"
→ kaydet.

Sonucu SADECE JSON döndür.

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
      memoryResponse.output_text || "{}";

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
        ...(currentMemory.facts || []),
        ...(Array.isArray(updates.facts)
          ? updates.facts
          : []),
      ],
      
      preferences: [
        ...(currentMemory.preferences || []),
        ...(Array.isArray(
          updates.preferences
        )
          ? updates.preferences
          : []),
      ],

      important: [
        ...(currentMemory.important || []),
        ...(Array.isArray(
          updates.important
        )
          ? updates.important
          : []),
      ],
    };

    memory.facts = [
      ...new Set(memory.facts),
    ].slice(-100);

    memory.preferences = [
      ...new Set(memory.preferences),
    ].slice(-100);

    memory.important = [
      ...new Set(memory.important),
    ].slice(-100);

    await saveMemory(memory);

    return memory;

  } catch {
    return currentMemory;
  }
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


    const conversationId =
      typeof body.conversationId === "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;


    /* ================================================
       DELETE
    ================================================ */

    if (
      body.deleteConversation === true
    ) {

      await deleteConversation(
        conversationId
      );

      return res.status(200).json({
        success: true,
        conversationId,
        deleted: true,
      });

    }


    /* ================================================
       NEW CONVERSATION
    ================================================ */

    if (
      body.newConversation === true
    ) {

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
       HISTORY
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
       INCOMING
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
       MERGE
    ================================================ */

    let combinedMessages = [
      ...oldMessages,
    ];


    for (
      const message of incomingMessages
    ) {

      combinedMessages.push(
        message
      );

    }


    combinedMessages =
      combinedMessages.slice(-100);


    /* ================================================
       LAST USER MESSAGE
    ================================================ */

    const lastUserMessage =
      [...incomingMessages]
        .reverse()
        .find(
          message =>
            message.role === "user"
        );


    /* ================================================
       MEMORY
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
       FINAL INSTRUCTIONS
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

Hafızadaki bilgileri değiştirme.

Hafızada olmayan bilgileri kesin
bilgi gibi uydurma.
`;


    /* ================================================
       GPT-5.6 LUNA
    ================================================ */

    const response =
      await openai.responses.create({

        model:
          "gpt-5.6-luna",

        reasoning: {
          effort: "low",
        },

        instructions:
          finalInstructions,

        tools: [
          {
            type: "web_search",
          },
        ],

        input:
          combinedMessages,

        truncation:
          "auto",

      });


    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";


    /* ================================================
       SAVE
    ================================================ */

    combinedMessages.push({

      role:
        "assistant",

      content:
        answer,

    });


    const savedMessages =
      await saveConversation(
        conversationId,
        combinedMessages
      );


    /* ================================================
       RESPONSE
    ================================================ */

    return res.status(200).json({

      success:
        true,

      conversationId,

      answer,

      history:
        savedMessages,

      memory,

      responseId:
        response.id,

    });


  } catch (error) {

    console.error(
      "ASA API HATASI:",
      error
    );


    return res.status(500).json({

      success:
        false,

      error:
        error?.message ||
        "ASA API'de bilinmeyen bir hata oluştu.",

    });

  }

}
