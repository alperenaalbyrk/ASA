import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Upstash değişkenlerini farklı isimlendirmelere karşı destekle
const redisUrl =
  process.env.STORAGE_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_URL;

const redisToken =
  process.env.STORAGE_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_TOKEN;

// ASA'nın hafıza anahtarı
const MEMORY_KEY = "asa:memory:alperen";

// Redis GET
async function getMemory() {
  if (!redisUrl || !redisToken) {
    console.warn("Upstash environment variables bulunamadı.");
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
    throw new Error("ASA hafızası okunamadı.");
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

// Redis SET
async function saveMemory(memory) {
  if (!redisUrl || !redisToken) {
    console.warn("Upstash environment variables bulunamadı.");
    return;
  }

  const response = await fetch(
    `${redisUrl}/set/${encodeURIComponent(MEMORY_KEY)}/${encodeURIComponent(
      JSON.stringify(memory)
    )}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("ASA hafızası kaydedilemedi.");
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

    // Frontend ister "message" ister "messages" gönderebilsin
    const newMessage =
      typeof body.message === "string"
        ? body.message.trim()
        : null;

    let messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    // Eğer tek mesaj geldiyse hafızaya ekle
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

    // Redis'ten eski konuşmaları getir
    let memory = await getMemory();

    if (!Array.isArray(memory)) {
      memory = [];
    }

    // Sadece geçerli mesajları al
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

    // Son kullanıcı mesajını bul
    const latestUserMessage =
      [...cleanMessages]
        .reverse()
        .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return res.status(400).json({
        error: "Kullanıcı mesajı bulunamadı.",
      });
    }

    // Önceki hafıza + mevcut konuşma
    const conversation = [
      ...memory,
      ...cleanMessages,
    ];

    // Çok büyümesini engelle
    const limitedConversation = conversation.slice(-30);

    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sıcak ve yardımcı ol.

Kendini gerektiğinde "ASA" olarak tanıt.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Alperen'le konuşurken önceki konuşmaların bağlamını dikkate al.

Alperen aynı bilgiyi daha önce söylediyse bunu hatırlıyormuş gibi davran.

Cevaplarını gereksiz yere uzatma.
Sorunun gerektirdiği kadar cevap ver.

Alperen teknik bir işlem yapıyorsa adım adım ve net şekilde yönlendir.

Kod verirken çalışabilir, eksiksiz kod ver.

Bilmediğin bir şeyi uydurma.
`,

      input: limitedConversation,
    });

    const answer =
      response.output_text?.trim() ||
      "Şu anda cevap oluşturamadım.";

    // Hafızaya yeni konuşmayı ekle
    const updatedMemory = [
      ...limitedConversation,
      {
        role: "assistant",
        content: answer,
      },
    ].slice(-30);

    // Hafızayı kaydet
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
