import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Her zaman Türkçe konuş.

Samimi, doğal, sakin ve zeki ol.

Alperen seninle günlük konuşuyorsa
arkadaşça ve rahat cevap ver.

Robotik konuşma.

Kısa sorulara kısa cevap ver.

Gereksiz yere uzun konuşma.

Karmaşık konularda gerektiği kadar
detaylı açıklama yap.

Sesli konuşmada doğal konuş.

Cümlelerini konuşma diline uygun kur.

Alperen sözünü kestiğinde hemen dur
ve onu dinlemeye devam et.

Alperen konuşmayı bitirdiğinde
gereksiz bekleme yapmadan cevap ver.

Kendinden bahsederken ASA adını kullan.
`;


/* =========================================================
   ASA REALTIME — CLIENT SECRET
========================================================= */

export default async function handler(req, res) {

  /* =======================================================
     METHOD
  ======================================================= */

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Sadece POST isteği kabul edilir.",
    });

  }


  /* =======================================================
     API KEY CHECK
  ======================================================= */

  if (!process.env.OPENAI_API_KEY) {

    console.error(
      "OPENAI_API_KEY bulunamadı."
    );

    return res.status(500).json({
      success: false,
      error:
        "Sunucuda OPENAI_API_KEY tanımlı değil.",
    });

  }


  /* =======================================================
     VOICE
  ======================================================= */

  const requestedVoice =
    req.body?.voice;

  const allowedVoices = [
    "marin",
    "cedar",
    "coral",
    "sage",
    "ash",
    "verse",
  ];

  const voice =
    allowedVoices.includes(
      requestedVoice
    )
      ? requestedVoice
      : "marin";


  /* =======================================================
     CREATE EPHEMERAL CLIENT SECRET
  ======================================================= */

  try {

    const response =
      await openai.realtime.clientSecrets.create({

        expires_after: {
          anchor: "created_at",
          seconds: 60,
        },

        session: {

          type: "realtime",

          model:
            "gpt-realtime-1.5",

          instructions:
            ASA_INSTRUCTIONS,

          audio: {

            input: {

              noise_reduction: {
                type: "near_field",
              },

              turn_detection: {

                type:
                  "semantic_vad",

                eagerness:
                  "medium",

                create_response:
                  true,

                interrupt_response:
                  true,

              },

            },

            output: {

              voice:
                voice,

            },

          },

        },

      });


    /* =====================================================
       VERIFY SECRET
    ===================================================== */

    if (
      !response ||
      !response.value
    ) {

      throw new Error(
        "OpenAI geçerli bir Realtime client secret döndürmedi."
      );

    }


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({

      success: true,

      clientSecret:
        response.value,

      expiresAt:
        response.expires_at,

      voice,

    });


  } catch (error) {

    console.error(
      "ASA REALTIME HATASI:",
      error
    );


    const status =
      Number.isInteger(
        error?.status
      )
        ? error.status
        : 500;


    return res.status(
      status >= 400 &&
      status < 600
        ? status
        : 500
    ).json({

      success: false,

      error:
        error?.message ||
        "Realtime bağlantısı oluşturulamadı.",

    });

  }

}
