import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Mesaj geçmişi gönderilmedi.",
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5",
      
      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.
Türkçe konuş.
Samimi, doğal ve yardımcı ol.
Kendini "ASA" olarak tanıt.
Kısa ve anlaşılır cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

Sana gönderilen messages dizisi önceki konuşma geçmişidir.
Önceki mesajları dikkate al ve konuşmanın bağlamını koru.
`,

      input: messages,
    });

    return res.status(200).json({
      answer: response.output_text,
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error: error.message || "Bilinmeyen hata",
    });
  }
}
