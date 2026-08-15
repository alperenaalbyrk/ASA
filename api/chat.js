import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.KV_URL;

const redisToken =
  process.env.KV_REST_API_TOKEN;

const MEMORY_KEY = "asa:memory:alperen";
const CHAT_KEY = "asa:chat:alperen";

async function redisCommand(command) {
  if (!redisUrl || !redisToken) {
    throw new Error("Redis bağlantı bilgileri bulunamadı.");
  }

  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
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

async function getValue(key) {
  const data = await redisCommand(["GET", key]);

  if (!data.result) {
    return null;
  }

  try {
    return JSON.parse(data.result);
  } catch {
    return data.result;
  }
}

async function setValue(key, value) {
  await redisCommand([
    "SET",
    key,
    JSON.stringify(value),
  ]);
}

async function getMemory() {
  const memory = await getValue(MEMORY_KEY);

  if (!Array.isArray(memory)) {
    return [];
  }

  return memory;
}

async function saveMemory(memory) {
  await setValue(
    MEMORY_KEY,
    memory.slice(-100)
  );
}

async function getChatHistory() {
  const history = await getValue(CHAT_KEY);

  if (!Array.isArray(history)) {
    return [];
  }

  return history;
}

async function saveChatHistory(history) {
  await setValue(
    CHAT_KEY,
    history.slice(-50)
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body = req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    /*
      --------------------------------
      1. HAFIZA KOMUTLARI
      --------------------------------
    */

    const lowerMessage = message.toLocaleLowerCase("tr-TR");

    if (
      lowerMessage.includes("beni unut") ||
      lowerMessage.includes("hafızanı temizle") ||
      lowerMessage.includes("hafızanı sıfırla")
    ) {
      await setValue(MEMORY_KEY, []);

      return res.status(200).json({
        answer:
          "Tamam Alperen. Kalıcı hafızamdaki bilgileri temizledim. 🧠🗑️",
      });
    }

    /*
      --------------------------------
      2. MEVCUT VERİLER
      --------------------------------
    */

    const memory = await getMemory();
    const chatHistory = await getChatHistory();

    /*
      --------------------------------
      3. OPENAI'YE GÖNDERİLECEK
         BAĞLAM
      --------------------------------
    */

    const context = [
      ...chatHistory,
      {
        role: "user",
        content: message,
      },
    ].slice(-30);

    const memoryText =
      memory.length > 0
        ? memory
            .map(
              (item) =>
                `- ${item}`
            )
            .join("\n")
        : "Henüz kayıtlı özel bilgi yok.";

    /*
      --------------------------------
      4. ASA
      --------------------------------
    */

    const response =
      await openai.responses.create({
        model: "gpt-5.6",

        instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sıcak ve yardımcı ol.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Aşağıdaki bilgiler ASA'nın kalıcı hafızasında
saklanan bilgilerdir:

${memoryText}

Bu bilgileri gerektiğinde kullan.

Önemli:
Kullanıcı sana kendisi hakkında kalıcı olması
mantıklı bir bilgi verdiğinde bunu hafızaya
alınabilecek bir bilgi olarak değerlendir.

Örneğin:
- adı
- sevdiği şeyler
- tercihleri
- işi
- kullandığı araçlar
- projeleri
- önemli kişisel tercihleri

Fakat her konuşmayı hafızaya alma.

Sadece gerçekten ileride işe yarayacak
kalıcı bilgileri dikkate al.

Kullanıcı "bunu hatırla", "bunu kaydet",
"aklında tut" gibi açık bir ifade kullanırsa
bu bilgiyi özellikle önemli kabul et.

Cevaplarını gereksiz yere uzatma.

Teknik işlemlerde adım adım ve net şekilde
yardımcı ol.

Bilmediğin bilgileri uydurma.
`,

        input: context,
      });

    const answer =
      response.output_text?.trim() ||
      "Şu anda cevap oluşturamadım.";

    /*
      --------------------------------
      5. SOHBET GEÇMİŞİNİ KAYDET
      --------------------------------
    */

    const updatedHistory = [
      ...chatHistory,
      {
        role: "user",
        content: message,
      },
      {
        role: "assistant",
        content: answer,
      },
    ];

    await saveChatHistory(updatedHistory);

    /*
      --------------------------------
      6. BASİT HAFIZA ALGILAMA
      --------------------------------

      Kullanıcı açıkça "hatırla/kaydet"
      diyorsa bilgiyi Redis'e ekliyoruz.
    */

    const wantsMemory =
      lowerMessage.includes("bunu hatırla") ||
      lowerMessage.includes("bunu kaydet") ||
      lowerMessage.includes("aklında tut") ||
      lowerMessage.includes("unutma");

    if (wantsMemory) {
      const newMemory = [
        ...memory,
        message,
      ];

      await saveMemory([
        ...new Set(newMemory),
      ]);
    }

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
