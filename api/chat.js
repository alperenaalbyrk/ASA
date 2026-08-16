import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN;

const MEMORY_KEY =
  "asa:memory:alperen";


/* =====================================================
   REDIS
===================================================== */

async function redisCommand(command) {

  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      "Redis bağlantısı bulunamadı."
    );
  }

  const response =
    await fetch(
      REDIS_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${REDIS_TOKEN}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(command),
      }
    );

  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Redis hatası: ${text}`
    );

  }

  return response.json();

}


/* =====================================================
   CONVERSATION
===================================================== */

function conversationKey(id) {

  return `asa:conversation:${id}`;

}


async function getConversation(id) {

  const result =
    await redisCommand([
      "GET",
      conversationKey(id),
    ]);

  if (!result?.result) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(result.result);

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

  /*
    Redis'e base64 görsel kaydetmiyoruz.

    Görselin metadata'sını tutuyoruz.
    Böylece Redis şişmiyor.
  */

  const clean =
    messages
      .filter(
        message =>
          message &&
          (
            message.role === "user" ||
            message.role === "assistant"
          )
      )
      .map(
        message => {

          const result = {
            role:
              message.role,

            content:
              typeof message.content === "string"
                ? message.content
                : "",

          };

          if(
            message.role === "user" &&
            Array.isArray(
              message.attachments
            )
          ){

            result.attachments =
              message.attachments.map(
                attachment => ({

                  name:
                    attachment.name ||
                    "Görsel",

                  type:
                    attachment.type ||
                    "",

                  size:
                    attachment.size ||
                    0,

                })
              );

          }

          return result;

        }
      )
      .slice(-100);

  await redisCommand([
    "SET",
    conversationKey(id),
    JSON.stringify(clean),
  ]);

  return clean;

}


async function deleteConversation(id) {

  await redisCommand([
    "DEL",
    conversationKey(id),
  ]);

}


/* =====================================================
   MEMORY
===================================================== */

function defaultMemory(){

  return {

    user:{
      name:"Alperen",
    },

    facts:[],
    preferences:[],
    important:[],

  };

}


async function getMemory(){

  try{

    const result=
      await redisCommand([
        "GET",
        MEMORY_KEY,
      ]);

    if(!result?.result){
      return defaultMemory();
    }

    const parsed=
      JSON.parse(result.result);

    return {

      user:
        parsed.user ||
        {
          name:"Alperen",
        },

      facts:
        Array.isArray(parsed.facts)
          ? parsed.facts
          : [],

      preferences:
        Array.isArray(
          parsed.preferences
        )
          ? parsed.preferences
          : [],

      important:
        Array.isArray(
          parsed.important
        )
          ? parsed.important
          : [],

    };

  }catch{

    return defaultMemory();

  }

}


async function saveMemory(memory){

  await redisCommand([
    "SET",
    MEMORY_KEY,
    JSON.stringify(memory),
  ]);

}


/* =====================================================
   MEMORY UPDATE
===================================================== */

async function updateMemory(
  memory,
  text
){

  if(!text){
    return memory;
  }

  /*
    Her mesajda ikinci bir büyük model
    çağrısı yapmamak için yalnızca açık
    kişisel bilgi kalıplarını yakalıyoruz.

    Daha sonra Hafıza ekranını ayrıca
    geliştirebiliriz.
  */

  const lower=
    text.toLocaleLowerCase(
      "tr-TR"
    );

  const next={
    ...memory,

    facts:[
      ...(memory.facts || [])
    ],

    preferences:[
      ...(memory.preferences || [])
    ],

    important:[
      ...(memory.important || [])
    ],

  };

  if(
    lower.includes(
      "benim adım"
    )
  ){

    next.user={
      ...(next.user || {}),
      name:"Alperen",
    };

  }

  if(
    lower.includes(
      "adım alperen"
    )
  ){

    next.user={
      ...(next.user || {}),
      name:"Alperen",
    };

  }

  await saveMemory(next);

  return next;

}


/* =====================================================
   NORMALIZE
===================================================== */

function normalizeHistory(
  history
){

  if(!Array.isArray(history)){
    return [];
  }

  return history
    .filter(
      message =>
        message &&
        (
          message.role === "user" ||
          message.role === "assistant"
        )
    )
    .map(
      message => ({

        role:
          message.role,

        content:
          typeof message.content === "string"
            ? message.content
            : "",

        attachments:
          Array.isArray(
            message.attachments
          )
            ? message.attachments
            : [],

      })
    );

}


/* =====================================================
   PERSONALITY
===================================================== */

const ASA_INSTRUCTIONS = `

Sen ASA'sın.

Alperen'in kişisel yapay zeka asistanısın.

Kullanıcının adı Alperen.

Türkçe konuş.

Samimi, doğal, zeki ve yardımsever ol.

Robot gibi konuşma.

Alperen'in konuşma tarzına uyum sağla.

Kısa sorulara gereksiz uzun cevap verme.

Karmaşık konularda yeterli açıklama yap.

Hafızada bulunan bilgileri doğal şekilde kullan.

Hafızada olmayan kişisel bilgileri uydurma.

GÖRSELLER:

Kullanıcı bir fotoğraf gönderirse
fotoğrafı gerçekten analiz et.

Fotoğrafta ne olduğunu soruyorsa
fotoğrafın kendisine bakarak cevap ver.

Fotoğrafı göremiyorsan bunu açıkça söyle.

GÜNCEL BİLGİ:

Güncel bilgi gerekiyorsa web araması kullan.

Örneğin:

- haber
- hava durumu
- döviz
- altın
- kripto
- borsa
- spor
- maç
- skor
- teknoloji
- ürün
- fiyat
- şirket
- etkinlik
- ulaşım

gibi konularda güncel bilgi kullan.

Basit günlük konuşmada web araması
kullanma.

Cevapların doğal Türkçe olsun.

Gereksiz emoji kullanma.

`;


/* =====================================================
   RESPONSE INPUT
===================================================== */

function buildModelInput(
  incomingMessages
){

  const input=[];

  for(
    const message of incomingMessages
  ){

    if(
      message.role !== "user" &&
      message.role !== "assistant"
    ){

      continue;

    }

    /*
      Assistant geçmişi
    */

    if(
      message.role === "assistant"
    ){

      if(message.content){

        input.push({

          role:"assistant",

          content:[
            {
              type:"output_text",
              text:String(
                message.content
              ),
            }
          ],

        });

      }

      continue;

    }

    /*
      USER
    */

    const content=[];

    if(message.content){

      content.push({

        type:"input_text",

        text:String(
          message.content
        ),

      });

    }

    /*
      Görsel varsa gerçek image input.
    */

    if(
      Array.isArray(
        message.attachments
      )
    ){

      for(
        const attachment
        of message.attachments
      ){

        if(
          attachment?.dataUrl &&
          attachment?.type?.startsWith(
            "image/"
          )
        ){

          content.push({

            type:"input_image",

            image_url:
              attachment.dataUrl,

            detail:"auto",

          });

        }

      }

    }

    if(content.length){

      input.push({

        role:"user",

        content,

      });

    }

  }

  return input;

}


/* =====================================================
   API
===================================================== */

export default async function handler(
  req,
  res
){

  if(req.method !== "POST"){

    return res.status(405).json({

      success:false,

      error:
        "Sadece POST isteği kabul edilir.",

    });

  }

  try{

    const body=
      req.body || {};

    const conversationId=
      typeof body.conversationId ===
      "string" &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : `chat-${Date.now()}`;


    /* =================================================
       DELETE
    ================================================= */

    if(
      body.deleteConversation === true
    ){

      await deleteConversation(
        conversationId
      );

      return res.status(200).json({

        success:true,

        conversationId,

        deleted:true,

      });

    }


    /* =================================================
       HISTORY
    ================================================= */

    const oldMessages=
      normalizeHistory(
        await getConversation(
          conversationId
        )
      );


    if(
      body.getHistory === true
    ){

      return res.status(200).json({

        success:true,

        conversationId,

        history:
          oldMessages,

        answer:"",

      });

    }


    /* =================================================
       INCOMING
    ================================================= */

    const incoming=
      Array.isArray(body.messages)
        ? body.messages
        : [];

    if(!incoming.length){

      return res.status(200).json({

        success:true,

        conversationId,

        history:
          oldMessages,

        answer:"",

      });

    }


    /*
      Sadece user mesajlarını kabul ediyoruz.
    */

    const normalizedIncoming=
      incoming
        .filter(
          message =>
            message &&
            message.role === "user"
        )
        .map(
          message => ({

            role:"user",

            content:
              typeof message.content === "string"
                ? message.content
                : "",

            attachments:
              Array.isArray(
                message.attachments
              )
                ? message.attachments
                : [],

          })
        );


    if(
      !normalizedIncoming.length
    ){

      return res.status(400).json({

        success:false,

        error:
          "Geçerli kullanıcı mesajı bulunamadı.",

      });

    }


    /* =================================================
       MEMORY
    ================================================= */

    let memory=
      await getMemory();

    const lastUser=
      normalizedIncoming[
        normalizedIncoming.length-1
      ];

    if(lastUser.content){

      memory=
        await updateMemory(
          memory,
          lastUser.content
        );

    }


    /* =================================================
       MODEL HISTORY
    ================================================= */

    const combined=[
      ...oldMessages,
      ...normalizedIncoming,
    ];

    /*
      Model için son 40 mesaj yeterli.
    */

    const modelMessages=
      combined.slice(-40);


    const modelInput=
      buildModelInput(
        modelMessages
      );


    /* =================================================
       MODEL
    ================================================= */

    const response=
      await openai.responses.create({

        model:"gpt-5.6",

        reasoning:{
          effort:"low",
        },

        instructions:`

${ASA_INSTRUCTIONS}

ALPEREN'İN HAFIZASI:

${JSON.stringify(
  memory,
  null,
  2
)}

`,

        input:
          modelInput,

        tools:[
          {
            type:"web_search",
          }
        ],

        truncation:"auto",

      });


    const answer=
      response.output_text ||
      "Şu anda cevap oluşturamadım.";


    /* =================================================
       SAVE
    ================================================= */

    const messagesToSave=[
      ...oldMessages,

      ...normalizedIncoming.map(
        message => ({

          role:"user",

          content:
            message.content,

          attachments:
            message.attachments.map(
              attachment => ({

                name:
                  attachment.name ||
                  "Görsel",

                type:
                  attachment.type ||
                  "",

                size:
                  attachment.size ||
                  0,

              })
            ),

        })
      ),

      {
        role:"assistant",
        content:answer,
      },

    ];

    const saved=
      await saveConversation(
        conversationId,
        messagesToSave
      );


    /* =================================================
       RESPONSE
    ================================================= */

    return res.status(200).json({

      success:true,

      conversationId,

      answer,

      history:saved,

      memory,

      responseId:
        response.id,

    });

  }catch(error){

    console.error(
      "ASA CHAT API HATASI:",
      error
    );

    return res.status(500).json({

      success:false,

      error:
        error?.message ||
        "ASA API'de bilinmeyen bir hata oluş.",

    });

  }

}
