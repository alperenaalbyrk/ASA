import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MEMORY_KEY = "asa:memory";

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// ================================
// REDIS KOMUTU
// ================================

async function redisCommand(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Redis bağlantı bilgileri bulunamadı.");
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

  return await response.json();
}

// ================================
// HAFIZAYI OKU
// ================================

async function getMemory() {
  try {
    const result = await redisCommand([
      "GET",
      MEMORY_KEY,
    ]);

    const raw = result?.result;

    // Hafıza yoksa
    if (!raw) {
      return [];
    }

    // Redis'ten gelen veri zaten array ise
    if (Array.isArray(raw)) {
      return raw;
    }

    // String ise JSON'a çevirmeyi dene
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
          return parsed;
        }

        return [];
      } catch {
        return [];
      }
    }

    // Object vb. başka bir şey geldiyse
    return [];

  } catch (error) {
    console.error("HAFIZA OKUMA HATASI:", error);
    return [];
  }
}

// ================================
// MESAJLARI TEMİZLE
// ================================

function cleanMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        typeof message === "object" &&
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim() !== ""
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

// ================================
// HAFIZAYI BİRLEŞTİR
// ================================

function mergeMessages(oldMessages, newMessages) {

  // Her iki tarafın da kesinlikle array olduğundan emin ol
  const oldArray = Array.isArray(oldMessages)
    ? oldMessages
    : [];

  const newArray = Array.isArray(newMessages)
    ? newMessages
    : [];

  const combined = [
    ...oldArray,
    ...newArray,
  ];

  return combined;
}

// ================================
// HAFIZAYI KAYDET
// ================================

async function saveMemory(messages) {
  try {

    const safeMessages = Array.isArray(messages)
      ? messages.slice(-60)
      : [];

    await redisCommand([
      "SET",
      MEMORY_KEY,
      JSON.stringify(safeMessages),
    ]);

  } catch (error) {
    console.error(
      "HAFIZA KAYDETME HATASI:",
      error
    );
  }
}

// ================================
// API
// ================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {

    // Kullanıcıdan gelen mesajlar
    const incomingMessages =
      cleanMessages(req.body?.messages);

    if (incomingMessages.length === 0) {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    // Redis hafızasını getir
    const oldMessages = await getMemory();

    // Eski + yeni mesajlar
    const allMessages = mergeMessages(
      oldMessages,
      incomingMessages
    );

    // Son 60 mesajı kullan
    const conversation =
      allMessages.slice(-60);

    // ================================
    // ASA TALİMATLARI
    // ================================

    const instructions = `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sıcak ve yardımcı ol.

Gereksiz uzun cevaplar verme.

Kullanıcıya gerektiğinde Alperen diye hitap et.

Sen Alperen'in kişisel yapay zekâ asistanısın.

HAFIZA:

Konuşma geçmişinde Alperen'in kendisi hakkında söylediği
bilgileri dikkate al.

Alperen daha önce bir bilgi verdiyse ve bu bilgi konuşma
geçmişinde bulunuyorsa onu hatırla.

Örneğin:

- En sevdiği renk siyah.
- En sevdiği oyun God of War.
- Kız arkadaşının adı Sıla.
- En sevdiği yemek İskender.
- Adı Alperen Albayrak.
- Sana ASA adını verdi.

Bu bilgiler konuşma geçmişinde bulunduğunda
sonraki sorularda doğru şekilde kullan.

Bilmediğin bir bilgiyi kesinlikle uydurma.

Bir bilgiden emin değilsen bunu açıkça söyle.

Kendini ASA olarak tanıt.
`;

    // ================================
    // OPENAI
    // ================================

    const response =
      await openai.responses.create({

        model: "gpt-5.6",

        instructions,

        input: conversation,

      });

    const answer =
      response.output_text?.trim() ||
      "Şu anda cevap oluşturamadım.";

    // ================================
    // YENİ HAFIZA
    // ================================

    const updatedMemory = [
      ...conversation,

      {
        role: "assistant",
        content: answer,
      },
    ];

    await saveMemory(updatedMemory);

    // ================================
    // CEVAP
    // ================================

    return res.status(200).json({
      answer,
    });

  } catch (error) {

    console.error(
      "ASA API HATASI:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "ASA bağlantısında bilinmeyen bir hata oluştu.",
    });
  }
}
