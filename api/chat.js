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
Kısa ve anlaşılır cevaplar ver.

Sen Alperen'in kişisel yapay zekâ asistanısın.

ÖNEMLİ:
Güncel bilgi gerektiğinde web aramasını kullan.

Örneğin:
- hava durumu
- güncel haberler
- döviz
- altın
- kripto
- borsa
- spor skorları
- maçlar
- güncel ürün fiyatları
- güncel teknoloji bilgileri
- internet üzerindeki güncel bilgiler
- tarih, saat ve değişebilen bilgiler

Kullanıcı güncel bir bilgi soruyorsa eski bilgine güvenme;
web araması yap ve mümkün olduğunca güncel bilgiye dayan.

Kişisel bilgiler ve önceki konuşmalar için gönderilen messages
geçmişini dikkate al.

Bir bilgi messages içinde varsa onu kullan.
Bilgi güncelse ve doğrulanması gerekiyorsa web araması yap.

Kullanıcıya web araması yaptığını gereksiz yere anlatma.
Sonucu doğal şekilde Türkçe aktar.
`,

      tools: [
        {
          type: "web_search",
        },
      ],

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
