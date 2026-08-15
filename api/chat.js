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

  return Array.isArray(memory)
    ? memory
    : [];
}

async function saveMemory(memory) {
  await setValue(
    MEMORY_KEY,
    [...new Set(memory)].slice(-100)
  );
}

async function getChatHistory() {
  const history = await getValue(CHAT_KEY);

  return Array.isArray(history)
    ? history
    : [];
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

    /*
     * FRONTEND'DEN GELEN MESAJI AL
     *
     * Eski index.html:
     * { message: "..." }
     *
     * Yeni sistem:
     * { messages: [...] }
     */

    let currentMessage = "";

    if (
      typeof body.message === "string" &&
      body.message.trim()
    ) {
      currentMessage = body.message.trim();
    }

    if (
      !currentMessage &&
      Array.isArray(body.messages) &&
      body.messages.length > 0
    ) {
      const lastUserMessage =
        [...body.messages]
          .reverse()
          .find(
            (item) =>
              item &&
              item.role === "user" &&
              typeof item.content === "string"
          );

      if (lastUserMessage) {
        currentMessage =
          lastUserMessage.content.trim();
      }
    }

    if (!currentMessage) {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    /*
     * HAFIZA KOMUTU
     */

    const lowerMessage =
      currentMessage.toLocaleLowerCase("tr-TR");

    if (
      lowerMessage.includes("beni unut") ||
      lowerMessage.includes("hafızanı temizle") ||
      lowerMessage.includes("hafızanı sıfırla")
    ) {
      await saveMemory([]);
      await saveChatHistory([]);

      return res.status(200).json({
        answer:
          "Tamam Alperen. Kalıcı hafızamdaki bilgileri temizledim. 🧠🗑️",
      });
    }

    /*
     * REDIS'TEN VERİLERİ AL
     */

    const memory = await getMemory();
    const chatHistory = await getChatHistory();

    /*
     * SOHBET BAĞLAMI
     */

    const context = [
      ...chatHistory,
      {
        role: "user",
        content: currentMessage,
      },
    ].slice(-30);

    /*
     * HAFIZA BİLGİLERİ
     */

    const memoryText =
      memory.length > 0
        ? memory
            .map(
              (item) => `- ${item}`
            )
            .join("\n")
        : "Henüz kayıtlı özel bilgi yok.";

    /*
     * OPENAI
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

Aşağıdaki bilgiler senin kalıcı hafızandır:

${memoryText}

Bu bilgileri gerektiğinde kullan.

Kullanıcı sana:

"bunu hatırla"
"bunu kaydet"
"aklında tut"
"unutma"

gibi bir ifade kullanırsa, verdiği bilgiyi
kalıcı hafızaya alınması gereken önemli
bir bilgi olarak değerlendir.

Her konuşmayı hafızaya alma.

Sadece gelecekte işe yarayacak kişisel
bilgileri hafızaya al.

Cevaplarını gereksiz yere uzatma.

Teknik konularda adım adım ve net yardım et.

Bilmediğin şeyi uydurma.
`,

        input: context,
      });

    const answer =
      response.output_text?.trim() ||
      "Şu anda cevap oluşturamadım.";

    /*
     * SOHBET GEÇMİŞİNİ KAYDET
     */

    await saveChatHistory([
      ...chatHistory,
      {
        role: "user",
        content: currentMessage,
      },
      {
        role: "assistant",
        content: answer,
      },
    ]);

    /*
     * AÇIK HAFIZA KOMUTU VARSA KAYDET
     */

    const wantsMemory =
      lowerMessage.includes("bunu hatırla") ||
      lowerMessage.includes("bunu kaydet") ||
      lowerMessage.includes("aklında tut") ||
      lowerMessage.includes("unutma");

    if (wantsMemory) {
      await saveMemory([
        ...memory,
        currentMessage,
      ]);
    }

    /*
     * CEVAP
     */

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
        "ASA tarafında bilinmeyen bir hata oluştu.",
    });
  }
}
