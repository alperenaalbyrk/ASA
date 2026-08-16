import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


/* =====================================================
   CONFIG
===================================================== */

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN;

const DEFAULT_CONVERSATION =
  "alperen-main";

const MEMORY_KEY =
  "asa:memory:alperen";

const MAX_MESSAGES =
  80;


/* =====================================================
   REDIS
===================================================== */

async function redisCommand(command) {

  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      "Redis bağlantısı bulunamadı. Vercel KV/Redis environment variable'larını kontrol et."
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

      body: JSON.stringify(command),
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

function conversationKey(
  conversationId
) {

  return `asa:conversation:${conversationId}`;

}


async function getConversation(
  conversationId
) {

  const result =
    await redisCommand([
      "GET",
      conversationKey(
        conversationId
      ),
    ]);

  const value =
    result?.result;

  if (!value) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(value);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return parsed;

  } catch {

    return [];

  }

}


async function saveConversation(
  conversationId,
  messages
) {

  const cleaned =
    normalizeStoredMessages(
      messages
    ).slice(
      -MAX_MESSAGES
    );

  await redisCommand([
    "SET",
    conversationKey(
      conversationId
    ),
    JSON.stringify(
      cleaned
    ),
  ]);

  return cleaned;

}


async function deleteConversation(
  conversationId
) {

  await redisCommand([
    "DEL",
    conversationKey(
      conversationId
    ),
  ]);

}


/* =====================================================
   MEMORY
===================================================== */

function defaultMemory() {

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

  const result =
    await redisCommand([
      "GET",
      MEMORY_KEY,
    ]);

  const value =
    result?.result;

  if (!value) {

    return defaultMemory();

  }

  try {

    const parsed =
      JSON.parse(value);

    return {

      user:
        parsed?.user || {
          name: "Alperen",
        },

      facts:
        Array.isArray(
          parsed?.facts
        )
          ? parsed.facts
          : [],

      preferences:
        Array.isArray(
          parsed?.preferences
        )
          ? parsed.preferences
          : [],

      important:
        Array.isArray(
          parsed?.important
        )
          ? parsed.important
          : [],

    };

  } catch {

    return defaultMemory();

  }

}


async function saveMemory(
  memory
) {

  await redisCommand([
    "SET",
    MEMORY_KEY,
    JSON.stringify(
      memory
    ),
  ]);

}


/* =====================================================
   NORMALIZE STORED MESSAGES
===================================================== */

function normalizeStoredMessages(
  messages
) {

  if (
    !Array.isArray(messages)
  ) {
    return [];
  }

  return messages
    .filter(
      message =>
        message &&
        (
          message.role ===
            "user" ||
          message.role ===
            "assistant"
        )
    )
    .map(
      message => {

        return {

          role:
            message.role,

          content:
            typeof message.content ===
            "string"
              ? message.content
              : "",

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
      message =>
        message.content.trim()
          .length > 0 ||
        message.attachments.length > 0
    );

}


/* =====================================================
   INCOMING MESSAGE NORMALIZATION
===================================================== */

function normalizeIncomingMessages(
  messages
) {

  if (
    !Array.isArray(messages)
  ) {
    return [];
  }

  return messages
    .filter(
      message =>
        message &&
        (
          message.role ===
            "user" ||
          message.role ===
            "assistant"
        )
    )
    .map(
      message => {

        const attachments =
          Array.isArray(
            message.attachments
          )
            ? message.attachments
            : [];

        let content =
          message.content;

        if (
          typeof content !==
          "string"
        ) {

          content = "";

        }

        return {

          role:
            message.role,

          content:
            content.trim(),

          attachments,

        };

      }
    )
    .filter(
      message =>
        message.content.length > 0 ||
        message.attachments.length > 0
    );

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

Alperen sana arkadaşça konuşuyorsa
arkadaşça ve doğal cevap ver.

Kısa sorulara kısa cevap ver.

Gereksiz uzun açıklamalar yapma.

Karmaşık konularda gerektiği kadar
detaylı açıklama yap.

Kullanıcı aynı şeyi tekrar sormadıkça
kendini gereksiz yere tekrar etme.

Hafızada bulunan kişisel bilgileri
doğal şekilde kullan.

Hafızada olmayan kişisel bilgileri
uydurma.

Kullanıcı sana görsel gönderirse
görseli incele ve gördüğün bilgilere
göre cevap ver.

Görseli gerçekten göremiyorsan
bunu açıkça söyle.

Güncel bilgi gerektiğinde web araması
kullan.

Özellikle:

- güncel haberler
- hava durumu
- döviz
- altın
- kripto
- borsa
- spor
- maçlar
- canlı skorlar
- teknoloji
- ürünler
- fiyatlar
- şirket haberleri
- etkinlikler
- ulaşım

gibi değişebilen konularda güncel
bilgiye dayan.

Basit günlük konuşmalarda gereksiz
web araması yapma.

Kendinden bahsederken ASA adını kullan.

Alperen sana başka bir isimle
hitap ederse doğal biçimde ASA olduğunu
belirt.

`;


/* =====================================================
   MEMORY EXTRACTION
===================================================== */

async function updateMemory(
  currentMemory,
  userText
) {

  if (
    !userText ||
    userText.trim().length < 3
  ) {

    return currentMemory;

  }

  try {

    const response =
      await openai.responses.create({

        model:
          "gpt-5.6",

        instructions: `
Sen ASA'nın hafıza yöneticisisin.

Kullanıcı Alperen.

Yalnızca gelecekte gerçekten işe
yarayabilecek kalıcı kişisel bilgileri
çıkar.

Geçici konuşmaları kaydetme.

Kullanıcının söylediği bilgileri
uydurma veya değiştirme.

Sadece JSON döndür.

Format:

{
  "facts": [],
  "preferences": [],
  "important": []
}

Yeni bilgi yoksa boş diziler döndür.
`,

        input: `
MEVCUT HAFIZA:

${JSON.stringify(
  currentMemory,
  null,
  2
)}

KULLANICININ YENİ MESAJI:

${userText}
`,

      });


    const raw =
      response.output_text ||
      "{}";

    const cleaned =
      raw
        .replace(
          /```json/gi,
          ""
        )
        .replace(
          /```/g,
          ""
        )
        .trim();


    const parsed =
      JSON.parse(
        cleaned
      );


    const memory = {

      user:
        currentMemory.user ||
        {
          name: "Alperen",
        },

      facts: [
        ...(currentMemory.facts || []),
        ...(Array.isArray(
          parsed.facts
        )
          ? parsed.facts
          : []),
      ],

      preferences: [
        ...(currentMemory.preferences || []),
        ...(Array.isArray(
          parsed.preferences
        )
          ? parsed.preferences
          : []),
      ],

      important: [
        ...(currentMemory.important || []),
        ...(Array.isArray(
          parsed.important
        )
          ? parsed.important
          : []),
      ],

    };


    memory.facts =
      [
        ...new Set(
          memory.facts
            .map(String)
            .map(
              x => x.trim()
            )
            .filter(Boolean)
        ),
      ].slice(-100);


    memory.preferences =
      [
        ...new Set(
          memory.preferences
            .map(String)
            .map(
              x => x.trim()
            )
            .filter(Boolean)
        ),
      ].slice(-100);


    memory.important =
      [
        ...new Set(
          memory.important
            .map(String)
            .map(
              x => x.trim()
            )
            .filter(Boolean)
        ),
      ].slice(-100);


    await saveMemory(
      memory
    );


    return memory;

  } catch (error) {

    console.error(
      "ASA MEMORY:",
      error
    );

    return currentMemory;

  }

}


/* =====================================================
   BUILD MODEL INPUT
===================================================== */

function buildModelInput(
  messages
) {

  return messages.map(
    message => {

      const parts = [];

      if (
        message.content
      ) {

        parts.push({

          type:
            "input_text",

          text:
            message.content,

        });

      }


      /*
       * Görselleri gerçekten
       * OpenAI multimodal input
       * olarak gönderiyoruz.
       */

      if (
        message.role ===
          "user" &&
        Array.isArray(
          message.attachments
        )
      ) {

        for (
          const attachment
          of message.attachments
        ) {

          if (
            !attachment ||
            !attachment.dataUrl ||
            !attachment.type ||
            !attachment.type
              .startsWith(
                "image/"
              )
          ) {
            continue;
          }


          parts.push({

            type:
              "input_image",

            image_url:
              attachment.dataUrl,

          });

        }

      }


      if (
        parts.length === 0
      ) {

        return null;

      }


      return {

        role:
          message.role,

        content:
          parts,

      };

    }
  ).filter(Boolean);

}


/* =====================================================
   EXTRACT LAST USER TEXT
===================================================== */

function getLastUserText(
  messages
) {

  for (
    let i =
      messages.length - 1;
    i >= 0;
    i--
  ) {

    if (
      messages[i].role ===
      "user"
    ) {

      return (
        messages[i].content ||
        ""
      );

    }

  }

  return "";

}


/* =====================================================
   API HANDLER
===================================================== */

export default async function handler(
  req,
  res
) {

  if (
    req.method !==
    "POST"
  ) {

    return res.status(405).json({

      success:
        false,

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


    /* =================================================
       DELETE
    ================================================= */

    if (
      body.deleteConversation ===
      true
    ) {

      await deleteConversation(
        conversationId
      );

      return res.status(200).json({

        success:
          true,

        conversationId,

        deleted:
          true,

      });

    }


    /* =================================================
       HISTORY
    ================================================= */

    if (
      body.getHistory ===
      true
    ) {

      const history =
        await getConversation(
          conversationId
        );

      return res.status(200).json({

        success:
          true,

        conversationId,

        history,

        answer:
          "",

      });

    }


    /* =================================================
       NEW CONVERSATION
    ================================================= */

    if (
      body.newConversation ===
      true
    ) {

      const newId =
        `asa-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2,8)}`;


      return res.status(200).json({

        success:
          true,

        conversationId:
          newId,

        history:
          [],

        answer:
          "",

      });

    }


    /* =================================================
       INCOMING
    ================================================= */

    const incoming =
      normalizeIncomingMessages(
        body.messages
      );


    if (
      incoming.length ===
      0
    ) {

      const history =
        await getConversation(
          conversationId
        );

      return res.status(200).json({

        success:
          true,

        conversationId,

        history,

        answer:
          "",

      });

    }


    /* =================================================
       LOAD HISTORY
    ================================================= */

    const history =
      await getConversation(
        conversationId
      );


    /* =================================================
       MERGE
    ================================================= */

    let combined = [
      ...history,
      ...incoming,
    ];


    /*
     * Aynı kullanıcı mesajının iki kez
     * eklenmesini engelle.
     */

    const deduped = [];

    for (
      const message
      of combined
    ) {

      const previous =
        deduped[
          deduped.length - 1
        ];


      if (
        previous &&
        previous.role ===
          message.role &&
        previous.content ===
          message.content &&
        JSON.stringify(
          previous.attachments || []
        ) ===
        JSON.stringify(
          message.attachments || []
        )
      ) {

        continue;

      }


      deduped.push(
        message
      );

    }


    combined =
      deduped.slice(
        -MAX_MESSAGES
      );


    /* =================================================
       MEMORY
    ================================================= */

    let memory =
      await getMemory();


    const lastUserText =
      getLastUserText(
        incoming
      );


    if (
      lastUserText
    ) {

      memory =
        await updateMemory(
          memory,
          lastUserText
        );

    }


    /* =================================================
       MODEL INSTRUCTIONS
    ================================================= */

    const instructions = `

${ASA_INSTRUCTIONS}

==============================
ALPEREN'İN HAFIZASI
==============================

${JSON.stringify(
  memory,
  null,
  2
)}

Bu bilgileri doğal şekilde kullan.

Hafızada olmayan kişisel bilgileri
uydurma.

`;


    /* =================================================
       OPENAI INPUT
    ================================================= */

    const modelInput =
      buildModelInput(
        combined
      );


    if (
      modelInput.length ===
      0
    ) {

      throw new Error(
        "Model için geçerli mesaj oluşturulamadı."
      );

    }


    /* =================================================
       RESPONSE
    ================================================= */

    const response =
      await openai.responses.create({

        model:
          "gpt-5.6",

        instructions,

        input:
          modelInput,

        tools: [
          {
            type:
              "web_search",
          },
        ],

        reasoning: {
          effort:
            "low",
        },

        truncation:
          "auto",

      });


    let answer =
      response.output_text ||
      "";


    answer =
      String(
        answer
      ).trim();


    if (
      !answer
    ) {

      answer =
        "Şu anda cevap oluşturamadım.";

    }


    /* =================================================
       SAVE
    ================================================= */

    const savedMessages =
      await saveConversation(
        conversationId,
        [
          ...combined,

          {
            role:
              "assistant",

            content:
              answer,

            attachments:
              [],

          },

        ]
      );


    /* =================================================
       RESPONSE
    ================================================= */

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
      "ASA CHAT API HATASI:",
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
