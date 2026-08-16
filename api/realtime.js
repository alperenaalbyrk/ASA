import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASA_INSTRUCTIONS = `
Sen ASA'sın.

Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, sakin ve zeki ol.

Robot gibi konuşma.

Kısa sorulara kısa cevap ver.

Karmaşık konularda yeterli açıklama yap.

Alperen sözünü keserse veya tekrar konuşmaya başlarsa
cevabını uzatma ve onu dinle.

Kendinden bahsederken her zaman ASA adını kullan.

Başka bir isimle çağrılırsan nazikçe düzelt.

Sesli konuşmada doğal konuş.
`;

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Sadece POST isteği kabul edilir.",
    });
  }

  try {

    const voice =
      typeof req.body?.voice === "string"
        ? req.body.voice
        : "marin";

    const response =
      await openai.realtime.clientSecrets.create({

        expires_after: {
          anchor: "created_at",
          seconds: 60,
        },

        session: {

          type: "realtime",

          model: "gpt-realtime-1.5",

          instructions:
            ASA_INSTRUCTIONS,

          audio: {

            input: {

              noise_reduction: {
                type: "near_field",
              },

              turn_detection: {

                type: "semantic_vad",

                eagerness: "medium",

                create_response: true,

                interrupt_response: true,

              },

            },

            output: {

              voice,

            },

          },

        },

      });

    return res.status(200).json({

      success: true,

      clientSecret:
        response.value,

      expiresAt:
        response.expires_at,

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
        "Realtime oturumu oluşturulamadı.",

    });

  }

}
