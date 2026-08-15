import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
  ASA - Alperen'in Kişisel Yapay Zeka Asistanı

  Bu API:
  - Konuşmaları Redis'te saklar
  - Sekme kapatılıp açılsa bile geçmişi korur
  - Web araması yapabilir
  - Güncel bilgileri araştırabilir
  - Önceki konuşmaları modele aktarır
  - Yeni sohbet desteği sağlar
  - Mobil istemcinin kolayca kullanabileceği JSON döndürür
*/

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN;

const DEFAULT_CONVERSATION = "alperen-main";

/* -------------------------------------------------------
   REDIS
------------------------------------------------------- */

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

/* -------------------------------------------------------
   KONUŞMA OKU
------------------------------------------------------- */

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

/* -------------------------------------------------------
   KONUŞMA KAYDET
------------------------------------------------------- */

async function saveConversation(conversationId, messages) {
  const key = `asa:conversation:${conversationId}`;

  /*
    Çok fazla eski mesajın modele gönderilmesini engellemek
    için son 80 mesajı saklıyoruz.
  */

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

/* -------------------------------------------------------
   YENİ SOHBET
------------------------------------------------------- */

async function deleteConversation(conversationId) {
  const key = `asa:conversation:${conversationId}`;

  await redisCommand([
    "DEL",
    key,
  ]);
}

/* -------------------------------------------------------
   ASA KİŞİLİĞİ
------------------------------------------------------- */

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Sen Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımcı ol.

Robot gibi konuşma.

Gereksiz uzun cevaplar verme.

Alperen bir şey sorduğunda doğrudan konuya gir.

Alperen'in önceki konuşmalarındaki bilgileri bağlam olarak kullan.

Kullanıcı bir konu hakkında devam sorusu soruyorsa önceki konuşmayı dikkate al.

Kullanıcının verdiği kişisel bilgileri unutma.

ÖNEMLİ:

Güncel bilgi gerekiyorsa web aramasını kullan.

Örneğin:

- hava durumu
- güncel haberler
- döviz
- altın
- kripto
- borsa
- spor sonuçları
- maçlar
- canlı skorlar
- güncel ürün fiyatları
- teknoloji haberleri
- şirket haberleri
- güncel siyasi gelişmeler
- tarih ve saat
- ulaşım bilgileri
- internet üzerindeki güncel bilgiler

Bu tür bilgilerde eski bilgiyi tahmin etmek yerine web araması yap.

Web aramasından gelen bilgileri olduğu gibi uzun uzun kopyalama.

Önce bilgiyi anla.

Sonra Alperen için kısa ve anlaşılır şekilde özetle.

Gerekirse kendi yorumunu ayrıca belirt.

Örneğin:

"Durum şu..."
"Benim yorumum..."
"Bunun anlamı..."

şeklinde doğal bir anlatım kullan.

Web araması yaptığında gereksiz şekilde
"web araması yaptım" deme.

Kullanıcı özellikle kaynak isterse kaynakları belirt.

Güncel olmayan bir bilgiyi güncelmiş gibi gösterme.

HAVA DURUMU:

Kullanıcı bir şehirde hava durumunu sorarsa güncel web verisini araştır.

HABER:

Kullanıcı "bugünün haberleri", "son dakika" veya benzeri bir şey sorarsa güncel haberleri araştır.

Haberleri sadece listeleme.

Önemli olanları seç.

Kısa bir özet ve gerekiyorsa yorum ekle.

SPOR:

Kullanıcı maç, skor, fikstür veya sporcu hakkında güncel bilgi sorarsa güncel bilgi araştır.

KONUŞMA:

Kullanıcı günlük sohbet yapıyorsa gereksiz web araması yapma.

Basit sorular için web araması yapma.

Örneğin:

"Bugün nasılsın?"
"Ne yapıyorsun?"
"Benim en sevdiğim renk ne?"

gibi sorular için web araması yapma.

HAFIZA:

Konuşma geçmişini dikkate al.

Bir bilgi daha önce konuşmada varsa onu hatırlıyormuş gibi doğal şekilde kullan.

Kullanıcı yeni bir kişisel bilgi verirse bunu konuşmanın ilerleyen bölümlerinde kullan.

CEVAP STİLİ:

Kısa ama yetersiz olmayan cevaplar ver.

Gereksiz tekrar yapma.

Kullanıcının diline uygun konuş.

Alperen "kanka", "chat", "ASA" gibi ifadeler kullanırsa doğal şekilde karşılık verebilirsin.

Emoji gerektiğinde kullanabilirsin fakat aşırı kullanma.

Alperen'in kişisel asistanı gibi davran.
`;

/* -------------------------------------------------------
   INPUT NORMALİZASYONU
------------------------------------------------------- */

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
      content: String(message.content || "").trim(),
    }))
    .filter((message) => message.content.length > 0);
}

/* -------------------------------------------------------
   API
------------------------------------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {
    const body = req.body || {};

    /*
      conversationId gönderilmezse Alperen'in ana sohbeti kullanılır.
    */

    const conversationId =
      typeof body.conversationId === "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : DEFAULT_CONVERSATION;

    const incomingMessages = normalizeMessages(body.messages);

    /*
      Redis'teki eski konuşmayı al.
    */

    let oldMessages = await getConversation(conversationId);

    /*
      Eğer istemci geçmişi zaten gönderiyorsa,
      Redis ile birleştiriyoruz.

      Aynı mesajların tekrar tekrar eklenmesini engellemek
      için basit bir içerik karşılaştırması yapıyoruz.
    */

    let combinedMessages = [...oldMessages];

    for (const message of incomingMessages) {
      const exists = combinedMessages.some(
        (oldMessage) =>
          oldMessage.role === message.role &&
          oldMessage.content === message.content
      );

      if (!exists) {
        combinedMessages.push(message);
      }
    }

    combinedMessages = combinedMessages.slice(-80);

    /*
      Yeni sohbet isteği
    */

    if (body.newConversation === true) {
      await deleteConversation(conversationId);

      return res.status(200).json({
        success: true,
        conversationId,
        history: [],
        answer: "",
        newConversation: true,
      });
    }

    /*
      Eğer sadece geçmiş isteniyorsa
      model çağırma.
    */

    if (
      body.getHistory === true &&
      incomingMessages.length === 0
    ) {
      return res.status(200).json({
        success: true,
        conversationId,
        history: oldMessages,
        answer: "",
      });
    }

    /*
      Kullanıcıdan yeni mesaj gelmediyse
      sadece mevcut geçmişi döndür.
    */

    if (incomingMessages.length === 0) {
      return res.status(200).json({
        success: true,
        conversationId,
        history: oldMessages,
        answer: "",
      });
    }

    /*
      Modele gönderilecek konuşma.

      Son mesaj kullanıcı mesajı olacak.
    */

    const response = await openai.responses.create({
      model: "gpt-5.6",

      instructions: ASA_INSTRUCTIONS,

      tools: [
        {
          type: "web_search",
        },
      ],

      input: combinedMessages,

      /*
        Çok uzun konuşmaların otomatik olarak
        yönetilmesine izin ver.
      */

      truncation: "auto",
    });

    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";

    /*
      Model cevabını konuşmaya ekle.
    */

    combinedMessages.push({
      role: "assistant",
      content: answer,
    });

    /*
      Konuşmayı Redis'e kaydet.
    */

    const savedMessages = await saveConversation(
      conversationId,
      combinedMessages
    );

    /*
      Frontend'e hem cevabı hem de güncel geçmişi gönder.
    */

    return res.status(200).json({
      success: true,

      conversationId,

      answer,

      history: savedMessages,

      responseId: response.id,
    });
  } catch (error) {
    console.error("ASA API HATASI:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "ASA API'de bilinmeyen bir hata oluştu.",
    });
  }
}
