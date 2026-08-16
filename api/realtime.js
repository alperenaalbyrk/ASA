/* =========================================================
   ASA REALTIME VOICE
   WebRTC + OpenAI Realtime
========================================================= */

(() => {

  "use strict";

  let realtimePeer = null;
  let realtimeStream = null;
  let realtimeDataChannel = null;

  let realtimeConnected = false;
  let realtimeConnecting = false;

  let voiceButton = null;
  let voiceClose = null;
  let voiceControl = null;
  let voiceMode = null;
  let voiceStatus = null;
  let remoteAudio = null;


  /* =======================================================
     DOM
  ======================================================= */

  function initVoiceDOM() {

    voiceButton =
      document.getElementById("voiceButton");

    voiceClose =
      document.getElementById("voiceClose");

    voiceControl =
      document.getElementById("voiceControl");

    voiceMode =
      document.getElementById("voiceMode");

    voiceStatus =
      document.getElementById("voiceStatus");

    remoteAudio =
      document.getElementById("remoteAudio");

  }


  /* =======================================================
     STATUS
  ======================================================= */

  function setVoiceStatus(text) {

    if (voiceStatus) {
      voiceStatus.textContent = text;
    }

  }


  function setVoiceState(state) {

    if (!voiceMode) {
      return;
    }

    voiceMode.classList.remove(
      "listening",
      "speaking",
      "connecting"
    );

    if (state) {
      voiceMode.classList.add(state);
    }

  }


  /* =======================================================
     CLIENT SECRET
  ======================================================= */

  async function getRealtimeClientSecret() {

    const response =
      await fetch(
        "/api/realtime",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            voice:
              window.settings?.voice ||
              "marin"

          })

        }
      );


    let data = null;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        "Realtime sunucusundan geçersiz cevap geldi."
      );

    }


    if (
      !response.ok ||
      !data?.success ||
      !data?.clientSecret
    ) {

      throw new Error(
        data?.error ||
        "Realtime client secret alınamadı."
      );

    }


    return data.clientSecret;

  }


  /* =======================================================
     ICE
  ======================================================= */

  function waitForIceGathering(peer) {

    return new Promise(resolve => {

      if (
        peer.iceGatheringState ===
        "complete"
      ) {

        resolve();

        return;

      }


      const check = () => {

        if (
          peer.iceGatheringState ===
          "complete"
        ) {

          peer.removeEventListener(
            "icegatheringstatechange",
            check
          );

          resolve();

        }

      };


      peer.addEventListener(
        "icegatheringstatechange",
        check
      );


      setTimeout(
        resolve,
        5000
      );

    });

  }


  /* =======================================================
     REALTIME EVENT SEND
  ======================================================= */

  function sendRealtimeEvent(event) {

    if (
      !realtimeDataChannel ||
      realtimeDataChannel.readyState !==
        "open"
    ) {

      console.warn(
        "Realtime DataChannel açık değil."
      );

      return false;

    }


    try {

      realtimeDataChannel.send(
        JSON.stringify(event)
      );

      return true;

    } catch (error) {

      console.error(
        "Realtime event gönderilemedi:",
        error
      );

      return false;

    }

  }


  /* =======================================================
     REALTIME EVENTS
  ======================================================= */

  function handleRealtimeEvent(event) {

    if (!event) {
      return;
    }


    console.log(
      "ASA REALTIME:",
      event
    );


    switch (event.type) {

      case "session.created":

        setVoiceStatus(
          "Seni dinliyorum..."
        );

        setVoiceState(
          "listening"
        );

        break;


      case "session.updated":

        setVoiceStatus(
          "Seni dinliyorum..."
        );

        setVoiceState(
          "listening"
        );

        break;


      case "input_audio_buffer.speech_started":

        setVoiceStatus(
          "Dinliyorum..."
        );

        setVoiceState(
          "listening"
        );

        break;


      case "input_audio_buffer.speech_stopped":

        setVoiceStatus(
          "Düşünüyorum..."
        );

        break;


      case "response.created":

        setVoiceStatus(
          "ASA düşünüyor..."
        );

        break;


      case "response.output_audio.started":

        setVoiceStatus(
          "ASA konuşuyor..."
        );

        setVoiceState(
          "speaking"
        );

        break;


      case "response.output_audio.delta":

        setVoiceStatus(
          "ASA konuşuyor..."
        );

        setVoiceState(
          "speaking"
        );

        break;


      case "response.audio.delta":

        setVoiceStatus(
          "ASA konuşuyor..."
        );

        setVoiceState(
          "speaking"
        );

        break;


      case "response.output_audio.done":

        setVoiceStatus(
          "Seni dinliyorum..."
        );

        setVoiceState(
          "listening"
        );

        break;


      case "response.done":

        setVoiceStatus(
          "Seni dinliyorum..."
        );

        setVoiceState(
          "listening"
        );

        break;


      case "error":

        console.error(
          "ASA REALTIME SERVER ERROR:",
          event
        );

        setVoiceStatus(
          event.error?.message ||
          "Ses bağlantısında hata oluştu."
        );

        setVoiceState(null);

        break;

    }

  }


  /* =======================================================
     CONNECT
  ======================================================= */

  async function connectRealtime() {

    if (
      realtimeConnected ||
      realtimeConnecting
    ) {

      return;

    }


    realtimeConnecting = true;


    setVoiceStatus(
      "ASA bağlanıyor..."
    );

    setVoiceState(
      "connecting"
    );


    try {

      /* ---------------------------------------------------
         1. Client secret
      --------------------------------------------------- */

      const clientSecret =
        await getRealtimeClientSecret();


      /* ---------------------------------------------------
         2. Peer
      --------------------------------------------------- */

      realtimePeer =
        new RTCPeerConnection();


      /* ---------------------------------------------------
         3. Remote audio
      --------------------------------------------------- */

      realtimePeer.ontrack =
        async event => {

          console.log(
            "ASA remote audio track geldi."
          );


          if (
            !remoteAudio ||
            !event.streams?.[0]
          ) {

            return;

          }


          remoteAudio.srcObject =
            event.streams[0];


          remoteAudio.autoplay =
            true;

          remoteAudio.playsInline =
            true;


          try {

            await remoteAudio.play();

          } catch(error) {

            console.warn(
              "Remote audio play:",
              error
            );

          }

        };


      /* ---------------------------------------------------
         4. Mikrofon
      --------------------------------------------------- */

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {

        throw new Error(
          "Bu tarayıcı mikrofon erişimini desteklemiyor."
        );

      }


      realtimeStream =
        await navigator.mediaDevices
          .getUserMedia({

            audio: {

              echoCancellation: true,

              noiseSuppression: true,

              autoGainControl: true

            },

            video: false

          });


      realtimeStream
        .getTracks()
        .forEach(track => {

          realtimePeer.addTrack(
            track,
            realtimeStream
          );

        });


      /* ---------------------------------------------------
         5. Data channel
      --------------------------------------------------- */

      realtimeDataChannel =
        realtimePeer.createDataChannel(
          "oai-events"
        );


      realtimeDataChannel.onopen =
        () => {

          console.log(
            "ASA REALTIME DATA CHANNEL: OPEN"
          );


          realtimeConnected =
            true;

          realtimeConnecting =
            false;


          setVoiceStatus(
            "Seni dinliyorum..."
          );

          setVoiceState(
            "listening"
          );


          /*
             Oturum ayarlarını burada gönderiyoruz.
          */

          sendRealtimeEvent({

            type:
              "session.update",

            session: {

              modalities: [
                "text",
                "audio"
              ],

              voice:
                window.settings?.voice ||
                "marin",

              input_audio_transcription: {
                model:
                  "gpt-4o-mini-transcribe"
              },

              turn_detection: {

                type:
                  "server_vad",

                threshold:
                  0.5,

                prefix_padding_ms:
                  300,

                silence_duration_ms:
                  500

              }

            }

          });

        };


      realtimeDataChannel.onmessage =
        event => {

          try {

            const data =
              JSON.parse(
                event.data
              );

            handleRealtimeEvent(
              data
            );

          } catch(error) {

            console.error(
              "Realtime event parse:",
              error
            );

          }

        };


      realtimeDataChannel.onerror =
        error => {

          console.error(
            "Realtime DataChannel error:",
            error
          );

          setVoiceStatus(
            "Ses bağlantısında hata oluştu."
          );

        };


      realtimeDataChannel.onclose =
        () => {

          console.log(
            "ASA REALTIME DATA CHANNEL: CLOSED"
          );

        };


      /* ---------------------------------------------------
         6. Offer
      --------------------------------------------------- */

      const offer =
        await realtimePeer.createOffer({

          offerToReceiveAudio: true

        });


      await realtimePeer
        .setLocalDescription(
          offer
        );


      /* ---------------------------------------------------
         7. ICE
      --------------------------------------------------- */

      await waitForIceGathering(
        realtimePeer
      );


      /* ---------------------------------------------------
         8. OpenAI Calls
      --------------------------------------------------- */

      const formData =
        new FormData();


      formData.append(
        "sdp",
        new Blob(
          [
            realtimePeer
              .localDescription
              .sdp
          ],
          {
            type:
              "application/sdp"
          }
        )
      );


      const response =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {

            method:
              "POST",

            headers: {

              Authorization:
                `Bearer ${clientSecret}`

            },

            body:
              formData

          }
        );


      const answer =
        await response.text();


      if (!response.ok) {

        throw new Error(
          answer ||
          `Realtime HTTP ${response.status}`
        );

      }


      /* ---------------------------------------------------
         9. Remote SDP
      --------------------------------------------------- */

      await realtimePeer
        .setRemoteDescription({

          type:
            "answer",

          sdp:
            answer

        });


      /* ---------------------------------------------------
         10. Connection state
      --------------------------------------------------- */

      realtimePeer.onconnectionstatechange =
        () => {

          const state =
            realtimePeer.connectionState;


          console.log(
            "ASA REALTIME CONNECTION:",
            state
          );


          switch(state) {

            case "connected":

              realtimeConnected =
                true;

              realtimeConnecting =
                false;

              setVoiceStatus(
                "Seni dinliyorum..."
              );

              setVoiceState(
                "listening"
              );

              break;


            case "connecting":

              setVoiceStatus(
                "Bağlanıyor..."
              );

              setVoiceState(
                "connecting"
              );

              break;


            case "disconnected":

              realtimeConnected =
                false;

              setVoiceStatus(
                "Bağlantı kesildi."
              );

              break;


            case "failed":

              realtimeConnected =
                false;

              setVoiceStatus(
                "Ses bağlantısı kurulamadı."
              );

              setVoiceState(null);

              break;


            case "closed":

              realtimeConnected =
                false;

              setVoiceStatus(
                "Bağlantı kapandı."
              );

              setVoiceState(null);

              break;

          }

        };


      console.log(
        "ASA REALTIME BAĞLANTI HAZIR."
      );


    } catch(error) {

      console.error(
        "ASA REALTIME CONNECT ERROR:",
        error
      );


      realtimeConnected =
        false;

      realtimeConnecting =
        false;


      setVoiceState(null);


      setVoiceStatus(
        error?.message ||
        "Ses bağlantısı kurulamadı."
      );


      await disconnectRealtime();

    }

  }


  /* =======================================================
     DISCONNECT
  ======================================================= */

  async function disconnectRealtime() {

    realtimeConnected =
      false;

    realtimeConnecting =
      false;


    if (realtimeDataChannel) {

      try {

        realtimeDataChannel.close();

      } catch {}

      realtimeDataChannel =
        null;

    }


    if (realtimeStream) {

      realtimeStream
        .getTracks()
        .forEach(track => {

          try {

            track.stop();

          } catch {}

        });


      realtimeStream =
        null;

    }


    if (realtimePeer) {

      try {

        realtimePeer.close();

      } catch {}

      realtimePeer =
        null;

    }


    if (remoteAudio) {

      try {

        remoteAudio.pause();

      } catch {}


      remoteAudio.srcObject =
        null;

    }

  }


  /* =======================================================
     OPEN VOICE MODE
  ======================================================= */

  async function openVoiceMode() {

    if (!voiceMode) {
      return;
    }


    voiceMode.classList.add(
      "open"
    );


    setVoiceStatus(
      "ASA bağlanıyor..."
    );


    await connectRealtime();

  }


  /* =======================================================
     CLOSE VOICE MODE
  ======================================================= */

  async function closeVoiceMode() {

    await disconnectRealtime();


    if (voiceMode) {

      voiceMode.classList.remove(
        "open"
      );

    }


    setVoiceState(null);


    setVoiceStatus(
      "Hazırım"
    );

  }


  /* =======================================================
     TOGGLE
  ======================================================= */

  async function toggleRealtime() {

    if (realtimeConnected) {

      await disconnectRealtime();


      setVoiceStatus(
        "Mikrofon kapalı"
      );


      setVoiceState(null);


      return;

    }


    await connectRealtime();

  }


  /* =======================================================
     BUTTONS
  ======================================================= */

  function setupVoiceButtons() {

    initVoiceDOM();


    if (!voiceButton) {

      console.error(
        "ASA: voiceButton bulunamadı."
      );

      return;

    }


    voiceButton.addEventListener(
      "click",
      async event => {

        event.preventDefault();

        event.stopPropagation();


        try {

          await openVoiceMode();

        } catch(error) {

          console.error(
            "Voice button:",
            error
          );

        }

      }
    );


    if (voiceClose) {

      voiceClose.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          await closeVoiceMode();

        }
      );

    }


    if (voiceControl) {

      voiceControl.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          await toggleRealtime();

        }
      );

    }

  }


  /* =======================================================
     PAGE
  ======================================================= */

  function init() {

    setupVoiceButtons();


    window.addEventListener(
      "pagehide",
      () => {

        disconnectRealtime();

      }
    );

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once:true
      }
    );

  } else {

    init();

  }


  /* =======================================================
     GLOBAL
  ======================================================= */

  window.openVoiceMode =
    openVoiceMode;

  window.closeVoiceMode =
    closeVoiceMode;

  window.toggleRealtime =
    toggleRealtime;

  window.connectRealtime =
    connectRealtime;

  window.disconnectRealtime =
    disconnectRealtime;

})();
