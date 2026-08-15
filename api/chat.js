import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Sadece POST kabul et
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    // Kullanıcı mesajını al
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Mesaj gönderilmedi.",
      });
    }

    // OpenAI'ye gönder
    const response = await openai.responses.create({
      model: "gpt-5.5",

      instructions: `
Sen ASA'sın.

Kullanıcının adı Alperen.
Her zaman Türkçe konuş.

Samimi, doğal ve yardımcı ol.
Kendini gerektiğinde "ASA" olarak tanıt.
Cevaplarını kısa, anlaşılır ve doğal tut.

Sen Alperen'in kişisel yapay zekâ asistanısın.
`,

      input: message,
    });

    // Cevabı siteye gönder
    return res.status(200).json({
      reply: response.output_text || "Üzgünüm, cevap oluşturamadım.",
    });

  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      error: error?.message || "Bilinmeyen API hatası.",
    });
  }
}
