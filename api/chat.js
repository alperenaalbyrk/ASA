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

  const response = await fetch(
    REDIS_URL,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${REDIS_TOKEN}`,

        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(command),
    }
  );

  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Redis hatası: ${text}`
    );
  }

  return response.json();
}


/* =====================================================
   CONVERSATION
===================================================== */

async function getConversation(
  conversationId
) {

  const result =
    await redisCommand([
      "GET",
      `asa:conversation:${conversationId}`,
    ]);

  const value =
    result?.result;

  if (!value) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(value);

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

  const cleanMessages =
    messages
      .filter(
        message =>
          message &&
          typeof message === "object" &&
          (
            message.role === "user" ||
            message.role === "assistant"
          )
      )
      .slice(-100);

  await redisCommand([
    "SET",
    `asa:conversation:${conversationId}`,
    JSON.stringify(cleanMessages),
  ]);

  return cleanMessages;
}


async function deleteConversation(
  conversationId
) {

  await redisCommand([
    "DEL",
    `asa:conversation:${conversationId}`,
  ]);

}


/* =====================================================
   MEMORY
===================================================== */

async function getMemory() {

  const result =
    await redisCommand([
      "GET",
      MEMORY_KEY,
    ]);

  const value =
    result?.result;

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

    const parsed =
      JSON.parse(value);

    return {

      user:
        parsed.user || {
          name: "Alperen",
        },

      facts:
        Array.isArray(
          parsed.facts
        )
          ? parsed.facts
          : [],

      preferences:
        Array.isArray(
          parsed.preferences
        )
          ? parsed.preferences
          : [],

      important:
        Array.isArray(
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


async function saveMemory(
  memory
) {

  await redisCommand([
    "SET",
    MEMORY_KEY,
    JSON.stringify(memory),
  ]);

  return memory;
}


/* =====================================================
   MESSAGE NORMALIZATION
===================================================== */

function normalizeMessages(
  messages
) {

  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      message =>
        message &&
        typeof message === "object" &&
        (
          message.role === "user" ||
          message.role === "assistant"
        )
    )
    .map(
      message => {

        /*
          ÖNEMLİ:

          content artık sadece string olmak
          zorunda değil.

          Görseller için array olabilir.
        */

        let content =
          message.content;

        if (
          typeof content ===
          "string"
        ) {

          content =
            content.trim();

        }

        return {

          role:
            message.role,

          content,

          attachments:
            Array.isArray(
              message.attachments
            )
              ? message.attachments
              : [],
        };

      }
    )
    .filter(
      message => {

        if (
          typeof message.content ===
          "string"
        ) {

          return (
            message.content.length >
            0
          );

        }

        return Array.isArray(
          message.content
        );

      }
    );

}


/* =====================================================
   ASA PERSONALITY
===================================================== */

const ASA_INSTRUCTIONS = `

Sen ASA'sın.

Alperen'in kişisel yapay zeka
asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımsever ol.

Robot gibi konuşma.

Alperen'in konuşma tarzına uyum sağla.

Kısa sorulara gereksiz uzun cevap verme.

Karmaşık konularda yeterli açıklama yap.

==============================
KİŞİSEL HAFIZA
==============================

Sana verilen kişisel hafızayı kullan.

Hafızada bulunan bilgileri Alperen
tekrar söylemeden kullanabilirsin.

Hafızada olmayan bilgileri uydurma.

==============================
GÖRSELLER
==============================

Kullanıcı bir görsel gönderirse
görseli gerçekten incele.

Görsel hakkında soru soruluyorsa
görselde gördüğün bilgilere göre cevap ver.

Görseli göremiyorsan bunu açıkça söyle.

==============================
GÜNCEL BİLGİ
==============================

Güncel bilgi gerektiğinde web search kullan.

Özellikle:

- haberler
- son dakika
- hava durumu
- döviz
- altın
- kripto
- borsa
- spor
- maç
- canlı skor
- teknoloji
- ürün fiyatları
- şirket haberleri
- ulaşım
- etkinlikler

gibi konularda güncel araştırma yap.

Basit günlük konuşmalarda
web kullanma.

==============================
CEVAP STİLİ
==============================

Türkçe konuş.

Samimi ol.

Gereksiz tekrar yapma.

Gereksiz emoji kullanma.

Alperen sana arkadaşça konuşuyorsa
doğal şekilde karşılık ver.

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

    const response =
      await openai.responses.create({

        model:
          "gpt-5.6",

        instructions: `
Sen ASA'nın kişisel hafıza yöneticisisin.

Kullanıcının adı Alperen.

Yeni kullanıcı mesajından gelecekte
işe yarayabilecek kalıcı kişisel bilgileri çıkar.

Geçici şeyleri kaydetme.

Sonucu sadece JSON döndür.

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
      response.output_text ||
      "{}";


    const cleaned =
      text
        .replace(
          /```json/g,
          ""
        )
        .replace(
          /```/g,
          ""
        )
        .trim();


    const updates =
      JSON.parse(cleaned);


    const memory = {

      ...currentMemory,

      facts: [
        ...(currentMemory.facts || []),
        ...(Array.isArray(
          updates.facts
        )
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


    memory.facts =
      [
        ...new Set(
          memory.facts
        ),
      ].slice(-100);


    memory.preferences =
      [
        ...new Set(
          memory.preferences
        ),
      ].slice(-100);


    memory.important =
      [
        ...new Set(
          memory.important
        ),
      ].slice(-100);


    await saveMemory(
      memory
    );


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

  if (
    req.method !== "POST"
  ) {

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
      typeof body.conversationId ===
        "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;


    /* ================================================
       DELETE
    ================================================ */

    if (
      body.deleteConversation ===
      true
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
       NEW CHAT
    ================================================ */

    if (
      body.newConversation ===
      true
    ) {

      const newId =
        `chat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;


      return res.status(200).json({

        success: true,

        conversationId:
          newId,

        history: [],

        answer: "",

        newConversation:
          true,

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
      (
        !body.messages ||
        !Array.isArray(
          body.messages
        ) ||
        body.messages.length === 0
      )
    ) {

      return res.status(200).json({

        success: true,

        conversationId,

        history:
          oldMessages,

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
      incomingMessages.length ===
      0
    ) {

      return res.status(200).json({

        success: true,

        conversationId,

        history:
          oldMessages,

        answer: "",

      });

    }


    /* ================================================
       MERGE
    ================================================ */

    let combinedMessages =
      [
        ...oldMessages,
        ...incomingMessages,
      ];


    combinedMessages =
      combinedMessages.slice(
        -100
      );


    /* ================================================
       LAST USER MESSAGE
    ================================================ */

    const lastUserMessage =
      [
        ...incomingMessages,
      ]
        .reverse()
        .find(
          message =>
            message.role ===
            "user"
        );


    /* ================================================
       MEMORY
    ================================================ */

    let memory =
      await getMemory();


    if (
      lastUserMessage
    ) {

      let memoryText = "";


      if (
        typeof
          lastUserMessage.content ===
        "string"
      ) {

        memoryText =
          lastUserMessage.content;

      }


      if (
        memoryText
      ) {

        memory =
          await updateMemory(
            memory,
            memoryText
          );

      }

    }


    /* ================================================
       INSTRUCTIONS
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

Hafızada olmayan bilgileri uydurma.

`;


    /* ================================================
       OPENAI
    ================================================ */

    const response =
      await openai.responses.create({

        model:
          "gpt-5.6",

        reasoning: {
          effort:
            "low",
        },

        instructions:
          finalInstructions,

        tools: [
          {
            type:
              "web_search",
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
       SAVE ASSISTANT
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
        "ASA API'de bilinmeyen bir hata oluş.",

    });

  }

}
