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
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.
Türkçe konuş.
Samimi, doğal ve yardımcı ol.
Kendini "ASA" olarak tanıt.
Kısa ve anlaşılır cevaplar ver.
Sen Alperen'in kişisel yapay zekâ asistanısın.
`,
      input: message,
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
