import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
  ============================================================
  ASA v1.1
  Alperen'in Kişisel Yapay Zeka Asistanı

  Özellikler:
  - Kalıcı sohbet geçmişi
  - Kalıcı kişisel hafıza
  - Yeni sohbet desteği
  - Web araması
  - Güncel bilgi
  - Hafıza ekleme / güncelleme / silme
  - Mobil uyumlu JSON API
  ============================================================
*/

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN;

const DEFAULT_CONVERSATION = "alperen-main";
const MEMORY_KEY = "asa:memory";

/* ============================================================
   REDIS
============================================================ */

async function redisCommand(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      "Redis bağlantısı bulunamadı. KV_REST_API_URL ve KV_REST_API_TOKEN ayarlanmalı."
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

/* ============================================================
   KONUŞMA OKU
============================================================ */

async function getConversation(conversationId) {
  const key = `asa:conversation:${conversationId}`;

  const result = await redisCommand([
    "GET",
    key,
  ]);

  const value = result?.result;

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

/* ============================================================
   KONUŞMA KAYDET
============================================================ */

async function saveConversation(conversationId, messages) {
  const key = `asa:conversation:${conversationId}`;

  const cleanMessages = messages
    .filter((message) => {
      return (
        message &&
        typeof message === "object" &&
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
      );
    })
    .slice(-80);

  await redisCommand([
    "SET",
    key,
    JSON.stringify(cleanMessages),
  ]);

  return cleanMessages;
}

/* ============================================================
   KONUŞMA SİL
============================================================ */

async function deleteConversation(conversationId) {
  const key = `asa:conversation:${conversationId}`;

  await redisCommand([
    "DEL",
    key,
  ]);
}

/* ============================================================
   HAFIZA OKU
============================================================ */

async function getMemory() {
  const result = await redisCommand([
    "GET",
    MEMORY_KEY,
  ]);

  const value = result?.result;

  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

/* ============================================================
   HAFIZA KAYDET
============================================================ */

async function saveMemory(memory) {
  await redisCommand([
    "SET",
    MEMORY_KEY,
    JSON.stringify(memory),
  ]);

  return memory;
}

/* ============================================================
   HAFIZA GÜNCELLE
============================================================ */

async function updateMemory({
  action,
  key,
  value,
}) {
  const memory = await getMemory();

  if (!key || typeof key !== "string") {
    return memory;
  }

  const cleanKey = key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 80);

  if (action === "delete") {
    delete memory[cleanKey];

    await saveMemory(memory);

    return memory;
  }

  if (
    action === "set" &&
    value !== undefined &&
    value !== null
  ) {
    const cleanValue = String(value)
      .trim()
      .slice(0, 1000);

    if (cleanValue.length > 0) {
      memory[cleanKey] = cleanValue;
    }

    await saveMemory(memory);
  }

  return memory;
}

/* ============================================================
   HAFIZA METNİ
============================================================ */

function memoryToText(memory) {
  const entries = Object.entries(memory || {});

  if (entries.length === 0) {
    return "Henüz kayıtlı kişisel hafıza yok.";
  }

  return entries
    .map(([key, value]) => {
      return `- ${key}: ${value}`;
    })
    .join("\n");
}

/* ============================================================
   ASA KİŞİLİĞİ
============================================================ */

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Sen Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımcı ol.

Robot gibi konuşma.

Gereksiz uzun cevaplar verme.

Alperen bir şey sorduğunda doğrudan konuya gir.

Alperen'in kişisel hafızasını ve önceki konuşmalarını bağlam olarak kullan.

============================================================
HAFIZA
============================================================

Sana ayrıca kalıcı hafıza verilecektir.

Bu hafıza Redis üzerinde saklanır.

Kalıcı ve anlamlı bir kişisel bilgi ortaya çıktığında
save_memory fonksiyonunu kullan.

Örneğin:

"En sevdiğim renk siyah."

"Benim en sevdiğim yemek İskender."

"Kız arkadaşımın adı Sıla."

"Ben Erzincan'da yaşıyorum."

"Ben reklam işi yapıyorum."

gibi bilgiler hafızaya alınabilir.

Ancak her konuşmayı hafızaya kaydetme.

Hava durumu gibi geçici bilgiler,
anlık haberler,
basit sohbetler,
sorular ve cevaplar hafızaya kaydedilmemelidir.

Bir kullanıcı açıkça:

"Bunu unut."

"Artık bunu hatırlama."

"Şunu hafızadan sil."

derse save_memory fonksiyonunu delete action ile kullan.

Hafızadaki mevcut bir bilgi değişirse eski bilgiyi
yeni bilgiyle güncelle.

Örneğin:

Eski:
favorite_color = siyah

Kullanıcı:
"Artık en sevdiğim renk kırmızı."

Yeni:
favorite_color = kırmızı

Hafızayı kullanıcıya göstermeden doğal şekilde kullan.

Kullanıcı:
"En sevdiğim renk ne?"

gibi bir soru sorarsa hafızadaki bilgiye göre cevap ver.

Hafıza ile konuşma geçmişini birbirine karıştırma.

============================================================
KONUŞMA
============================================================

Önceki konuşmaları dikkate al.

Kullanıcı devam sorusu soruyorsa önceki mesajları kullan.

Yeni sohbet açılmış olsa bile kalıcı hafızayı kullan.

Kullanıcı aynı soruyu daha önce sormuşsa,
gereksiz yere tekrar sormak yerine önceki bilgiyi kullan.

============================================================
GÜNCEL BİLGİ
============================================================

Güncel bilgi gerektiğinde web aramasını kullan.

Örneğin:

- hava durumu
- güncel haberler
- son dakika
- döviz
- altın
- kripto
- borsa
- spor sonuçları
- canlı skorlar
- maçlar
- fikstür
- ürün fiyatları
- teknoloji haberleri
- şirket haberleri
- siyasi gelişmeler
- tarih
- saat
- ulaşım
- internet üzerindeki güncel bilgiler

gibi konularda eski bilgiyi tahmin etme.

Web aramasından gelen bilgiyi önce değerlendir.

Sonra Alperen'e doğal Türkçe ile aktar.

Haberleri sadece kopyalama.

Önemli olanı seç.

Gerekirse kısa yorum ekle.

Örneğin:

"Durum şu..."

"Benim yorumum..."

"Bunun anlamı..."

şeklinde konuşabilirsin.

Kullanıcı istemedikçe uzun kaynak listeleri verme.

============================================================
WEB ARAMASI
============================================================

Güncel bilgi gerektiğinde web_search aracını kullan.

Basit günlük sohbetlerde web araması yapma.

Örneğin:

"Bugün nasılsın?"

"Ne yapıyorsun?"

"En sevdiğim renk ne?"

gibi sorular için web araması yapma.

============================================================
HAVA DURUMU
============================================================

Bir şehir için hava durumu sorulursa güncel web verisini araştır.

============================================================
HABER
============================================================

"Bugünün haberleri",
"son dakika",
"şu anda dünyada ne oluyor"
gibi sorular güncel araştırma gerektirir.

Önemli başlıkları seç.

Kısa özet yap.

Gerekiyorsa yorum ekle.

============================================================
SPOR
============================================================

Maç, skor, fikstür veya sporcu hakkında güncel bilgi
sorulursa güncel araştırma yap.

============================================================
CEVAP TARZI
============================================================

Kısa ama yeterli cevaplar ver.

Gereksiz tekrar yapma.

Alperen'in konuşma tarzına uyum sağla.

Samimi ol.

Doğal ol.

Gerektiğinde emoji kullan ama abartma.

Alperen "kanka", "chat", "ASA" gibi ifadeler kullanırsa
doğal şekilde karşılık verebilirsin.

Sen Alperen'in kişisel asistanısın.
`;

/* ============================================================
   HAFIZA FONKSİYON TOOL
============================================================ */

const memoryTool = {
  type: "function",

  name: "save_memory",

  description:
    "Alperen hakkında kalıcı ve anlamlı bir kişisel bilgiyi hafızaya ekler, günceller veya siler.",

  parameters: {
    type: "object",

    properties: {
      action: {
        type: "string",

        enum: [
          "set",
          "delete",
        ],
      },

      key: {
        type: "string",

        description:
          "Kısa ve anlaşılır hafıza anahtarı. Örneğin favorite_color, favorite_food, girlfriend_name.",
      },

      value: {
        type: "string",

        description:
          "Kaydedilecek bilgi. delete işleminde boş bırakılabilir.",
      },
    },

    required: [
      "action",
      "key",
      "value",
    ],

    additionalProperties: false,
  },

  strict: true,
};

/* ============================================================
   INPUT NORMALİZASYONU
============================================================ */

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        typeof message === "object" &&
        (message.role === "user" ||
          message.role === "assistant")
      );
    })
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

/* ============================================================
   ASA API
============================================================ */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error:
        "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body = req.body || {};

    /* -------------------------------------------------------
       CONVERSATION ID
    ------------------------------------------------------- */

    const conversationId =
      typeof body.conversationId === "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;

    /* -------------------------------------------------------
       INPUT
    ------------------------------------------------------- */

    const incomingMessages =
      normalizeMessages(body.messages);

    /* -------------------------------------------------------
       HAFIZA
    ------------------------------------------------------- */

    let memory = await getMemory();

    /* -------------------------------------------------------
       YENİ SOHBET
    ------------------------------------------------------- */

    if (body.newConversation === true) {
      await deleteConversation(
        conversationId
      );

      return res.status(200).json({
        success: true,

        conversationId,

        history: [],

        memory,

        answer: "",

        newConversation: true,
      });
    }

    /* -------------------------------------------------------
       SADECE HAFIZA İSTENİYORSA
    ------------------------------------------------------- */

    if (
      body.getMemory === true &&
      incomingMessages.length === 0
    ) {
      return res.status(200).json({
        success: true,

        conversationId,

        history:
          await getConversation(
            conversationId
          ),

        memory,

        answer: "",
      });
    }

    /* -------------------------------------------------------
       ESKİ KONUŞMA
    ------------------------------------------------------- */

    const oldMessages =
      await getConversation(
        conversationId
      );

    /* -------------------------------------------------------
       MESAJLARI BİRLEŞTİR
    ------------------------------------------------------- */

    let combinedMessages = [
      ...oldMessages,
    ];

    for (const message of incomingMessages) {
      const exists =
        combinedMessages.some(
          (oldMessage) =>
            oldMessage.role ===
              message.role &&
            oldMessage.content ===
              message.content
        );

      if (!exists) {
        combinedMessages.push(
          message
        );
      }
    }

    combinedMessages =
      combinedMessages.slice(-80);

    /* -------------------------------------------------------
       GEÇMİŞ İSTENİYORSA
    ------------------------------------------------------- */

    if (
      body.getHistory === true &&
      incomingMessages.length === 0
    ) {
      return res.status(200).json({
        success: true,

        conversationId,

        history: oldMessages,

        memory,

        answer: "",
      });
    }

    /* -------------------------------------------------------
       YENİ MESAJ YOKSA
    ------------------------------------------------------- */

    if (incomingMessages.length === 0) {
      return res.status(200).json({
        success: true,

        conversationId,

        history: oldMessages,

        memory,

        answer: "",
      });
    }

    /* -------------------------------------------------------
       MODEL BAĞLAMI
    ------------------------------------------------------- */

    const memoryContext = `
============================================================
ASA KALICI HAFIZASI
============================================================

${memoryToText(memory)}

Bu bilgiler Alperen hakkında daha önce kaydedilmiş
kalıcı bilgilerdir.

Bunları gerektiğinde doğal şekilde kullan.
`;

    const instructions =
      ASA_INSTRUCTIONS +
      "\n\n" +
      memoryContext;

    /* -------------------------------------------------------
       İLK MODEL ÇAĞRISI
    ------------------------------------------------------- */

    let response =
      await openai.responses.create({
        model: "gpt-5.6",

        instructions,

        tools: [
          {
            type: "web_search",
          },

          memoryTool,
        ],

        input:
          combinedMessages,

        truncation: "auto",
      });

    /* -------------------------------------------------------
       TOOL ÇAĞRILARINI İŞLE
    ------------------------------------------------------- */

    let toolRound = 0;

    while (
      toolRound < 3
    ) {
      const functionCalls =
        (response.output || []).filter(
          (item) =>
            item &&
            item.type ===
              "function_call" &&
            item.name ===
              "save_memory"
        );

      if (
        functionCalls.length === 0
      ) {
        break;
      }

      const toolOutputs = [];

      for (
        const call of functionCalls
      ) {
        try {
          const args =
            JSON.parse(
              call.arguments || "{}"
            );

          memory =
            await updateMemory({
              action:
                args.action,

              key:
                args.key,

              value:
                args.value,
            });

          toolOutputs.push({
            type:
              "function_call_output",

            call_id:
              call.call_id,

            output: JSON.stringify({
              success: true,

              memory,
            }),
          });
        } catch (toolError) {
          console.error(
            "ASA HAFIZA TOOL HATASI:",
            toolError
          );

          toolOutputs.push({
            type:
              "function_call_output",

            call_id:
              call.call_id,

            output: JSON.stringify({
              success: false,

              error:
                toolError?.message ||
                "Hafıza güncellenemedi.",
            }),
          });
        }
      }

      response =
        await openai.responses.create({
          model: "gpt-5.6",

          instructions,

          tools: [
            {
              type: "web_search",
            },

            memoryTool,
          ],

          previous_response_id:
            response.id,

          input:
            toolOutputs,

          truncation: "auto",
        });

      toolRound++;
    }

    /* -------------------------------------------------------
       CEVAP
    ------------------------------------------------------- */

    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";

    /* -------------------------------------------------------
       CEVABI KONUŞMAYA EKLE
    ------------------------------------------------------- */

    combinedMessages.push({
      role: "assistant",

      content: answer,
    });

    /* -------------------------------------------------------
       KONUŞMAYI KAYDET
    ------------------------------------------------------- */

    const savedMessages =
      await saveConversation(
        conversationId,
        combinedMessages
      );

    /* -------------------------------------------------------
       HAFIZAYI TEKRAR OKU
       TOOL GÜNCELLEMESİNDEN SONRA EN GÜNCEL HALİ AL
    ------------------------------------------------------- */

    memory =
      await getMemory();

    /* -------------------------------------------------------
       RESPONSE
    ------------------------------------------------------- */

    return res.status(200).json({
      success: true,

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
      success: false,

      error:
        error?.message ||
        "ASA API'de bilinmeyen bir hata oluştu.",
    });
  }
}
