import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;


/* =====================================================
   REDIS
===================================================== */

async function redisCommand(command) {

  if (!REDIS_URL || !REDIS_TOKEN) {
    return null;
  }

  const response = await fetch(
    `${REDIS_URL}/${command
      .map(value =>
        encodeURIComponent(
          typeof value === "string"
            ? value
            : JSON.stringify(value)
        )
      )
      .join("/")}`,
    {
      headers: {
        Authorization:
          `Bearer ${REDIS_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Redis error: ${response.status}`
    );
  }

  return response.json();
}


async function getConversation(id) {

  if (!id) {
    return [];
  }

  try {

    const result =
      await redisCommand([
        "GET",
        `asa:conversation:${id}`
      ]);

    if (
      !result ||
      !result.result
    ) {
      return [];
    }

    const parsed =
      JSON.parse(
        result.result
      );

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {

    return [];

  }

}


async function saveConversation(
  id,
  messages
) {

  if (!id) {
    return;
  }

  await redisCommand([
    "SET",
    `asa:conversation:${id}`,
    JSON.stringify(messages)
  ]);

}


async function deleteConversation(id) {

  if (!id) {
    return;
  }

  await redisCommand([
    "DEL",
    `asa:conversation:${id}`
  ]);

}


/* =====================================================
   NORMALIZE MESSAGE
===================================================== */

function normalizeMessage(message) {

  if (!message) {
    return null;
  }

  return {
    role:
      message.role === "assistant"
        ? "assistant"
        : "user",

    content:
      typeof message.content === "string"
        ? message.content
        : normalizeContent(
            message.content
          )
  };

}


function normalizeContent(content) {

  if (!Array.isArray(content)) {
    return String(
      content || ""
    );
  }

  return content
    .map(item => {

      if (
        item.type ===
        "input_text"
      ) {

        return item.text || "";

      }

      if (
        item.type ===
        "input_image"
      ) {

        return "";

      }

      return "";

    })
    .filter(Boolean)
    .join("\n");

}


/* =====================================================
   OPENAI CONTENT
===================================================== */

function buildOpenAIContent(
  content
) {

  if (
    typeof content ===
    "string"
  ) {

    return content;

  }


  if (!Array.isArray(content)) {

    return String(
      content || ""
    );

  }


  return content
    .map(item => {

      if (
        item.type ===
        "input_text"
      ) {

        return {
          type: "text",
          text:
            item.text || ""
        };

      }


      if (
        item.type ===
        "input_image"
      ) {

        return {
          type: "image_url",
          image_url: {
            url:
              item.image_url
          }
        };

      }


      return null;

    })
    .filter(Boolean);

}


/* =====================================================
   SYSTEM PROMPT
===================================================== */

const SYSTEM_PROMPT = `
Sen ASA'sın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal ve akıcı ol.

Gereksiz uzun cevaplar verme.

Kullanıcının sorusunu doğrudan cevapla.

Günlük konuşmalarda arkadaşça ama düzgün konuş.

Teknik konularda net ve anlaşılır ol.

Kullanıcı bir görsel gönderirse görseli gerçekten analiz etmeye çalış.

Bilmediğin bir şeyi kesinmiş gibi söyleme.

Sen kişisel bir yapay zeka asistanısın.
`;


/* =====================================================
   API
===================================================== */

export default async function handler(
  req,
  res
) {

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({
      success: false,
      error:
        "Method not allowed"
    });

  }


  try {

    const body =
      req.body || {};


    /* ===============================================
       DELETE
    =============================================== */

    if (
      body.deleteConversation
    ) {

      await deleteConversation(
        body.conversationId
      );

      return res.status(200).json({
        success: true
      });

    }


    /* ===============================================
       HISTORY
    =============================================== */

    if (
      body.getHistory
    ) {

      const history =
        await getConversation(
          body.conversationId
        );

      return res.status(200).json({

        success: true,

        history

      });

    }


    /* ===============================================
       VALIDATION
    =============================================== */

    if (
      !body.conversationId
    ) {

      return res.status(400).json({

        success: false,

        error:
          "conversationId gerekli."

      });

    }


    if (
      !Array.isArray(
        body.messages
      ) ||
      !body.messages.length
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Mesaj bulunamadı."

      });

    }


    /* ===============================================
       EXISTING HISTORY
    =============================================== */

    const conversation =
      await getConversation(
        body.conversationId
      );


    const incoming =
      body.messages
        .map(
          normalizeMessage
        )
        .filter(Boolean);


    if (!incoming.length) {

      return res.status(400).json({

        success: false,

        error:
          "Geçerli mesaj bulunamadı."

      });

    }


    /*
      Son kullanıcı mesajını alıyoruz.
    */

    const latest =
      incoming[
        incoming.length - 1
      ];


    const apiContent =
      buildOpenAIContent(
        latest.content
      );


    /* ===============================================
       OPENAI REQUEST
    =============================================== */

    const response =
      await client.responses.create({

        model:
          "gpt-5",

        instructions:
          SYSTEM_PROMPT,

        input: [

          ...conversation
            .slice(-30)
            .map(message => ({

              role:
                message.role,

              content:
                typeof message.content ===
                "string"

                  ? message.content

                  : String(
                      message.content ||
                      ""
                    )

            })),

          {

            role: "user",

            content:
              apiContent

          }

        ]

      });


    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";


    /* ===============================================
       SAVE HISTORY
    =============================================== */

    conversation.push({

      role: "user",

      content:
        typeof latest.content ===
        "string"

          ? latest.content

          : normalizeContent(
              latest.content
            )

    });


    conversation.push({

      role: "assistant",

      content:
        answer

    });


    await saveConversation(
      body.conversationId,
      conversation.slice(-100)
    );


    /* ===============================================
       RESPONSE
    =============================================== */

    return res.status(200).json({

      success: true,

      answer,

      history:
        conversation.slice(-100)

    });


  } catch (error) {

    console.error(
      "ASA CHAT ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "ASA cevap verirken bir hata oluştu."

    });

  }

}
