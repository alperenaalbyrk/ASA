import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {

  /* =====================================================
     METHOD
  ===================================================== */

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Sadece POST isteği kabul edilir.",
    });

  }


  /* =====================================================
     REALTIME CLIENT SECRET
  ===================================================== */

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

          instructions: `
Sen ASA'sın.

Alperen'in kişisel yapay zeka
asistanısın.

Türkçe konuş.

Samimi, doğal, sakin ve zeki ol.

Alperen sana günlük konuşma
yapıyorsa arkadaşça cevap ver.

Robot gibi konuşma.

Kısa sorulara kısa cevap ver.

Karmaşık konularda yeterli açıklama yap.

Kullanıcının adı Alperen.

Kendinden bahsederken
her zaman ASA adını kullan.

Başka bir isimle çağrılırsan
nazikçe düzelt.

Sesli konuşmada doğal konuş.

Cümleleri gereksiz yere uzatma.

Kullanıcı sözünü kestiğinde
veya tekrar konuşmaya başladığında
cevabı uzatma ve onu dinlemeye devam et.
`,

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
                "marin",

            },

          },

        },

      });


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({

      success: true,

      clientSecret:
        response.value,

      expiresAt:
        response.expires_at,

      session:
        response.session || null,

    });


  } catch (error) {

    console.error(
      "ASA REALTIME HATASI:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Realtime bağlantısı oluşturulamadı.",

    });

  }

}
