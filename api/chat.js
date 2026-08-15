import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Vercel + Upstash Redis bağlantısı
const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.KV_URL;

const redisToken =
  process.env.KV_REST_API_TOKEN;

// ASA hafıza anahtarı
const MEMORY_KEY = "asa:memory:alperen";

// Redis'ten hafızayı oku
async function getMemory() {
  if (!redisUrl || !redisToken) {
    console.error("Redis değişkenleri bulunamadı.");
    return [];
  }

  const response = await fetch(
    `${redisUrl}/get/${encodeURIComponent(MEMORY_KEY)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Redis hafızası okunamadı: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.result) {
    return [];
  }

  try {
    return JSON.parse(data.result);
  } catch {
    return [];
  }
}

// Redis'e hafızayı kaydet
async function saveMemory(memory) {
  if (!redisUrl || !redisToken) {
    throw new Error(
      "KV_REST_API_URL veya KV_REST_API_TOKEN bulunamadı."
    );
  }

  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "SET",
      MEMORY_KEY,
      JSON.stringify(memory),
    ]),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Redis hafızası kaydedilemedi: ${errorText}`
    );
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body = req.body || {};

    const newMessage =
      typeof body.message === "string"
        ? body.message.trim()
        : null;

    let messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    // Tek mesaj geldiyse konuşmaya ekle
    if (newMessage) {
      messages = [
        ...messages,
        {
          role: "user",
          content: newMessage,
        },
      ];
    }

    if (!messages.length) {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    // Kalıcı hafızayı Redis'ten getir
    let memory = await getMemory();

    if (!Array.isArray(memory)) {
      memory = [];
    }

    // Geçerli mesajları temizle
    const cleanMessages = messages
      .filter(
        (message) =>
          message &&
          typeof message === "object" &&
          (message.role === "user" ||
            message.role === "assistant") &&
          typeof message.content === "string"
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    if (!cleanMessages.length) {
      return res.status(400).json({
        error: "Geçerli mesaj bulunamadı.",
      });
    }

    // Redis hafızası + mevcut konuşma
    const conversation = [
      ...memory,
      ...cleanMessages,
    ];

    // Son 30 mesajı tut
    const limitedConversation =
      conversation.slice(-30);

    // OpenAI
    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sıcak ve yardımcı ol.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Önceki konuşmalardan gelen bilgileri dikkate al.

Alperen daha önce bir bilgi verdiyse ve bu bilgi konuşma hafızasında varsa,
bunu hatırla ve gerektiğinde kullan.

Cevaplarını gereksiz yere uzatma.

Teknik işlemlerde Alperen'e adım adım ve net şekilde yardımcı ol.

Kod verirken eksiksiz ve çalışabilir kod ver.

Bilmediğin bilgileri uydurma.
`,

      input: limitedConversation,
    });

    const answer =
      response.output_text?.trim() ||
      "Şu anda cevap oluşturamadım.";

    // Yeni konuşmayı kalıcı hafızaya ekle
    const updatedMemory = [
      ...limitedConversation,
      {
        role: "assistant",
        content: answer,
      },
    ].slice(-30);

    // Redis'e kaydet
    await saveMemory(updatedMemory);

    return res.status(200).json({
      answer,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "ASA tarafında bilinmeyen bir hata oluştu.",
    });
  }
}
