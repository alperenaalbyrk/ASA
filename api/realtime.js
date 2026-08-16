/* =========================================================
   ASA REALTIME VOICE
   WebRTC + OpenAI Realtime
   iPhone / Safari uyumlu
   ASA v5
========================================================= */

(() => {

  "use strict";


  /* =======================================================
     CONFIG
  ======================================================= */

  const REALTIME_ENDPOINT =
    "/api/realtime";

  const OPENAI_REALTIME_ENDPOINT =
    "https://api.openai.com/v1/realtime/calls";

  const DEFAULT_VOICE =
    "marin";


  /* =======================================================
     STATE
  ======================================================= */

  let peer = null;

  let microphone = null;

  let dataChannel = null;

  let connected = false;

  let connecting = false;

  let closing = false;


  /* =======================================================
     DOM
  ======================================================= */

  let voiceButton = null;

  let voiceClose = null;

  let voiceControl = null;

  let voiceMode = null;

  let voiceStatus = null;

  let remoteAudio = null;


  /* =======================================================
     DOM INIT
  ======================================================= */

  function initDOM() {

    voiceButton =
      document.getElementById(
        "voiceButton"
      );

    voiceClose =
      document.getElementById(
        "voiceClose"
      );

    voiceControl =
      document.getElementById(
        "voiceControl"
      );

    voiceMode =
      document.getElementById(
        "voiceMode"
      );

    voiceStatus =
      document.getElementById(
        "voiceStatus"
      );

    remoteAudio =
      document.getElementById(
        "remoteAudio"
      );


    if (remoteAudio) {

      remoteAudio.autoplay =
        true;

      remoteAudio.playsInline =
        true;

      remoteAudio.setAttribute(
        "playsinline",
        ""
      );

      remoteAudio.setAttribute(
        "autoplay",
        ""
      );

    }

  }


  /* =======================================================
     STATUS
  ======================================================= */

  function setStatus(text) {

    if (!voiceStatus) {
      return;
    }

    voiceStatus.textContent =
      text || "";

  }


  /* =======================================================
     VISUAL STATE
  ======================================================= */

  function setState(state) {

    if (!voiceMode) {
      return;
    }


    voiceMode.classList.remove(
      "connecting",
      "listening",
      "speaking"
    );


    if (state) {

      voiceMode.classList.add(
        state
      );

    }

  }


  /* =======================================================
     VOICE SETTING
  ======================================================= */

  function getSelectedVoice() {

    /*
      index.html artık v5 kullanıyor.
      Eski v4 ayarı varsa onu da
      geriye dönük olarak destekliyoruz.
    */

    const v5 =
      localStorage.getItem(
        "asa_voice_v5"
      );


    if (v5) {
      return v5;
    }


    const v4 =
      localStorage.getItem(
        "asa_voice_v4"
      );


    if (v4) {
      return v4;
    }


    /*
      index.html içindeki global
      settings değişkeni mevcutsa
      onu da kullan.
    */

    try {

      if (
        window.settings &&
        window.settings.voice
      ) {

        return window.settings.voice;

      }

    } catch {}


    return DEFAULT_VOICE;

  }


  /* =======================================================
     CLIENT SECRET
  ======================================================= */

  async function getClientSecret() {

    const voice =
      getSelectedVoice();


    console.log(
      "ASA REALTIME VOICE:",
      voice
    );


    let response;


    try {

      response =
        await fetch(
          REALTIME_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                voice
              })
          }
        );

    } catch (error) {

      throw new Error(
        "Realtime sunucusuna ulaşılamadı."
      );

    }


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
      !data ||
      data.success !== true ||
      !data.clientSecret
    ) {

      console.error(
        "ASA REALTIME CLIENT SECRET ERROR:",
        data
      );


      throw new Error(
        data?.error ||
        "Realtime client secret alınamadı."
      );

    }


    return data.clientSecret;

  }


  /* =======================================================
     SEND REALTIME EVENT
  ======================================================= */

  function sendEvent(event) {

    if (
      !dataChannel ||
      dataChannel.readyState !== "open"
    ) {

      console.warn(
        "ASA: Realtime DataChannel açık değil."
      );

      return false;

    }


    try {

      dataChannel.send(
        JSON.stringify(event)
      );

      return true;

    } catch (error) {

      console.error(
        "ASA Realtime event gönderilemedi:",
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
      "ASA REALTIME EVENT:",
      event
    );


    switch (event.type) {


      /* ---------------------------------------------------
         SESSION
      --------------------------------------------------- */

      case "session.created":

        setStatus(
          "Seni dinliyorum..."
        );

        setState(
          "listening"
        );

        break;


      case "session.updated":

        setStatus(
          "Seni dinliyorum..."
        );

        setState(
          "listening"
        );

        break;


      /* ---------------------------------------------------
         USER SPEECH
      --------------------------------------------------- */

      case "input_audio_buffer.speech_started":

        setStatus(
          "Dinliyorum..."
        );

        setState(
          "listening"
        );

        break;


      case "input_audio_buffer.speech_stopped":

        setStatus(
          "ASA düşünüyor..."
        );

        setState(
          "connecting"
        );

        break;


      /* ---------------------------------------------------
         RESPONSE
      --------------------------------------------------- */

      case "response.created":

        setStatus(
          "ASA düşünüyor..."
        );

        break;


      case "response.output_audio.started":

        setStatus(
          "ASA konuşuyor..."
        );

        setState(
          "speaking"
        );

        break;


      case "response.output_audio.delta":

        setStatus(
          "ASA konuşuyor..."
        );

        setState(
          "speaking"
        );

        break;


      case "response.audio.delta":

        setStatus(
          "ASA konuşuyor..."
        );

        setState(
          "speaking"
        );

        break;


      case "response.output_audio.done":

        setStatus(
          "Seni dinliyorum..."
        );

        setState(
          "listening"
        );

        break;


      case "response.done":

        setStatus(
          "Seni dinliyorum..."
        );

        setState(
          "listening"
        );

        break;


      /* ---------------------------------------------------
         TRANSCRIPTION
      --------------------------------------------------- */

      case "conversation.item.input_audio_transcription.completed":

        console.log(
          "ASA TRANSCRIPTION:",
          event.transcript || ""
        );

        break;


      /* ---------------------------------------------------
         ERROR
      --------------------------------------------------- */

      case "error":

        console.error(
          "ASA REALTIME SERVER ERROR:",
          event
        );


        setStatus(
          event.error?.message ||
          "Ses bağlantısında hata oluştu."
        );


        setState(
          null
        );

        break;

    }

  }


  /* =======================================================
     ICE GATHERING
  ======================================================= */

  function waitForIce(connection) {

    return new Promise(
      resolve => {

        if (
          !connection ||
          connection.iceGatheringState ===
            "complete"
        ) {

          resolve();

          return;

        }


        let finished =
          false;


        const finish = () => {

          if (finished) {
            return;
          }

          finished =
            true;


          connection.removeEventListener(
            "icegatheringstatechange",
            check
          );


          resolve();

        };


        const check = () => {

          if (
            connection.iceGatheringState ===
              "complete"
          ) {

            finish();

          }

        };


        connection.addEventListener(
          "icegatheringstatechange",
          check
        );


        setTimeout(
          finish,
          8000
        );

      }
    );

  }


  /* =======================================================
     REMOTE AUDIO
  ======================================================= */

  async function attachRemoteAudio(
    stream
  ) {

    if (
      !remoteAudio ||
      !stream
    ) {

      return;

    }


    console.log(
      "ASA: Remote audio stream geldi."
    );


    try {

      remoteAudio.srcObject =
        stream;

      remoteAudio.autoplay =
        true;

      remoteAudio.playsInline =
        true;


      await remoteAudio.play();


      console.log(
        "ASA: Remote audio oynatılıyor."
      );

    } catch (error) {

      console.warn(
        "ASA remote audio autoplay:",
        error
      );

    }

  }


  /* =======================================================
     CONNECTION STATE
  ======================================================= */

  function setupConnectionState() {

    if (!peer) {
      return;
    }


    peer.onconnectionstatechange =
      () => {

        if (!peer) {
          return;
        }


        const state =
          peer.connectionState;


        console.log(
          "ASA REALTIME CONNECTION:",
          state
        );


        switch (state) {


          case "new":

            setStatus(
              "Bağlanıyor..."
            );

            setState(
              "connecting"
            );

            break;


          case "connecting":

            setStatus(
              "Bağlanıyor..."
            );

            setState(
              "connecting"
            );

            break;


          case "connected":

            connected =
              true;

            connecting =
              false;

            setStatus(
              "Seni dinliyorum..."
            );

            setState(
              "listening"
            );

            break;


          case "disconnected":

            connected =
              false;

            setStatus(
              "Bağlantı kesildi."
            );

            setState(
              null
            );

            break;


          case "failed":

            connected =
              false;

            connecting =
              false;

            setStatus(
              "Ses bağlantısı kurulamadı."
            );

            setState(
              null
            );

            break;


          case "closed":

            connected =
              false;

            connecting =
              false;

            setStatus(
              "Bağlantı kapandı."
            );

            setState(
              null
            );

            break;

        }

      };

  }


  /* =======================================================
     CONNECTION
  ======================================================= */

  async function connectRealtime() {

    if (
      connected ||
      connecting
    ) {

      return;

    }


    connecting =
      true;

    closing =
      false;


    setStatus(
      "ASA bağlanıyor..."
    );

    setState(
      "connecting"
    );


    try {


      /* ---------------------------------------------------
         1. Browser check
      --------------------------------------------------- */

      if (
        !window.RTCPeerConnection
      ) {

        throw new Error(
          "Bu cihaz WebRTC bağlantısını desteklemiyor."
        );

      }


      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {

        throw new Error(
          "Bu tarayıcı mikrofon erişimini desteklemiyor."
        );

      }


      /* ---------------------------------------------------
         2. Client secret
      --------------------------------------------------- */

      const clientSecret =
        await getClientSecret();


      if (!clientSecret) {

        throw new Error(
          "Realtime client secret boş geldi."
        );

      }


      /* ---------------------------------------------------
         3. PeerConnection
      --------------------------------------------------- */

      peer =
        new RTCPeerConnection();


      /* ---------------------------------------------------
         4. Remote audio
      --------------------------------------------------- */

      peer.ontrack =
        event => {

          console.log(
            "ASA: ontrack"
          );


          if (
            event.streams &&
            event.streams[0]
          ) {

            attachRemoteAudio(
              event.streams[0]
            );

          }

        };


      /* ---------------------------------------------------
         5. Microphone
      --------------------------------------------------- */

      setStatus(
        "Mikrofon hazırlanıyor..."
      );


      microphone =
        await navigator
          .mediaDevices
          .getUserMedia({

            audio: {

              echoCancellation:
                true,

              noiseSuppression:
                true,

              autoGainControl:
                true

            },

            video:
              false

          });


      if (
        !microphone ||
        !microphone.getTracks()
          .length
      ) {

        throw new Error(
          "Mikrofon başlatılamadı."
        );

      }


      microphone
        .getTracks()
        .forEach(
          track => {

            peer.addTrack(
              track,
              microphone
            );

          }
        );


      /* ---------------------------------------------------
         6. Data channel
      --------------------------------------------------- */

      dataChannel =
        peer.createDataChannel(
          "oai-events"
        );


      dataChannel.onopen =
        () => {

          console.log(
            "ASA REALTIME DATA CHANNEL OPEN"
          );


          connected =
            true;

          connecting =
            false;


          setStatus(
            "Seni dinliyorum..."
          );

          setState(
            "listening"
          );


          /*
             Oturum ayarları.
          */

          const voice =
            getSelectedVoice();


          const sessionUpdate = {

            type:
              "session.update",

            session: {

              type:
                "realtime",

              audio: {

                input: {

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

                },

                output: {

                  voice

                }

              },

              input_audio_transcription: {

                model:
                  "gpt-4o-mini-transcribe"

              }

            }

          };


          console.log(
            "ASA SESSION UPDATE:",
            sessionUpdate
          );


          sendEvent(
            sessionUpdate
          );

        };


      dataChannel.onmessage =
        event => {

          try {

            const data =
              JSON.parse(
                event.data
              );


            handleRealtimeEvent(
              data
            );

          } catch (error) {

            console.error(
              "ASA Realtime event parse:",
              error,
              event.data
            );

          }

        };


      dataChannel.onerror =
        error => {

          console.error(
            "ASA DATA CHANNEL ERROR:",
            error
          );


          setStatus(
            "Ses bağlantısında hata oluştu."
          );

        };


      dataChannel.onclose =
        () => {

          console.log(
            "ASA REALTIME DATA CHANNEL CLOSED"
          );

        };


      /* ---------------------------------------------------
         7. Connection state
      --------------------------------------------------- */

      setupConnectionState();


      /* ---------------------------------------------------
         8. SDP offer
      --------------------------------------------------- */

      const offer =
        await peer.createOffer({

          offerToReceiveAudio:
            true

        });


      if (
        !offer ||
        !offer.sdp
      ) {

        throw new Error(
          "WebRTC SDP offer oluşturulamadı."
        );

      }


      await peer.setLocalDescription(
        offer
      );


      /* ---------------------------------------------------
         9. ICE
      --------------------------------------------------- */

      await waitForIce(
        peer
      );


      if (
        !peer ||
        !peer.localDescription ||
        !peer.localDescription.sdp
      ) {

        throw new Error(
          "WebRTC SDP hazır değil."
        );

      }


      const sdp =
        peer.localDescription.sdp;


      /* ---------------------------------------------------
         10. OpenAI
      --------------------------------------------------- */

      setStatus(
        "ASA bağlantısı kuruluyor..."
      );


      const response =
        await fetch(
          OPENAI_REALTIME_ENDPOINT,
          {

            method:
              "POST",

            headers: {

              Authorization:
                `Bearer ${clientSecret}`,

              "Content-Type":
                "application/sdp"

            },

            body:
              sdp

          }
        );


      const answer =
        await response.text();


      if (
        !response.ok
      ) {

        console.error(
          "ASA REALTIME HTTP ERROR:",
          response.status,
          answer
        );


        throw new Error(
          answer ||
          `Realtime HTTP ${response.status}`
        );

      }


      if (
        !answer ||
        typeof answer !==
          "string"
      ) {

        throw new Error(
          "OpenAI geçerli bir SDP cevabı göndermedi."
        );

      }


      /* ---------------------------------------------------
         11. Remote SDP
      --------------------------------------------------- */

      await peer.setRemoteDescription({

        type:
          "answer",

        sdp:
          answer

      });


      console.log(
        "ASA REALTIME SDP BAĞLANTISI TAMAMLANDI"
      );


      /*
        DataChannel biraz sonra açılabilir.
        Connection state de ayrıca takip ediliyor.
      */


    } catch (error) {

      console.error(
        "ASA REALTIME CONNECT ERROR:",
        error
      );


      connected =
        false;

      connecting =
        false;


      setState(
        null
      );


      setStatus(
        error?.message ||
        "Ses bağlantısı kurulamadı."
      );


      await disconnectRealtime(
        true
      );

    }

  }


  /* =======================================================
     DISCONNECT
  ======================================================= */

  async function disconnectRealtime(
    silent = false
  ) {

    if (closing) {
      return;
    }


    closing =
      true;


    connected =
      false;

    connecting =
      false;


    /* ---------------------------------------------------
       DataChannel
    --------------------------------------------------- */

    if (dataChannel) {

      try {

        dataChannel.onopen =
          null;

        dataChannel.onmessage =
          null;

        dataChannel.onerror =
          null;

        dataChannel.onclose =
          null;

        dataChannel.close();

      } catch {}

      dataChannel =
        null;

    }


    /* ---------------------------------------------------
       Microphone
    --------------------------------------------------- */

    if (microphone) {

      try {

        microphone
          .getTracks()
          .forEach(
            track => {

              try {

                track.stop();

              } catch {}

            }
          );

      } catch {}

      microphone =
        null;

    }


    /* ---------------------------------------------------
       Peer
    --------------------------------------------------- */

    if (peer) {

      try {

        peer.ontrack =
          null;

        peer.onconnectionstatechange =
          null;

        peer.close();

      } catch {}

      peer =
        null;

    }


    /* ---------------------------------------------------
       Audio
    --------------------------------------------------- */

    if (remoteAudio) {

      try {

        remoteAudio.pause();

      } catch {}


      try {

        remoteAudio.srcObject =
          null;

      } catch {}

    }


    closing =
      false;


    if (!silent) {

      console.log(
        "ASA REALTIME DISCONNECTED"
      );

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


    setStatus(
      "ASA bağlanıyor..."
    );


    setState(
      "connecting"
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


    setState(
      null
    );


    setStatus(
      "Hazırım"
    );

  }


  /* =======================================================
     MICROPHONE TOGGLE
  ======================================================= */

  async function toggleRealtime() {

    if (connected) {

      await disconnectRealtime();


      if (voiceControl) {

        voiceControl.classList.add(
          "off"
        );

      }


      setStatus(
        "Mikrofon kapalı"
      );


      setState(
        null
      );


      return;

    }


    if (voiceControl) {

      voiceControl.classList.remove(
        "off"
      );

    }


    await connectRealtime();

  }


  /* =======================================================
     BUTTONS
  ======================================================= */

  function setupButtons() {

    initDOM();


    if (!voiceButton) {

      console.error(
        "ASA: voiceButton bulunamadı."
      );

      return;

    }


    /* ---------------------------------------------------
       Voice open
    --------------------------------------------------- */

    voiceButton.addEventListener(
      "click",
      async event => {

        event.preventDefault();

        event.stopPropagation();


        try {

          await openVoiceMode();

        } catch (error) {

          console.error(
            "ASA voice button:",
            error
          );

        }

      }
    );


    /* ---------------------------------------------------
       Voice close
    --------------------------------------------------- */

    if (voiceClose) {

      voiceClose.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          event.stopPropagation();


          try {

            await closeVoiceMode();

          } catch (error) {

            console.error(
              "ASA voice close:",
              error
            );

          }

        }
      );

    }


    /* ---------------------------------------------------
       Microphone control
    --------------------------------------------------- */

    if (voiceControl) {

      voiceControl.addEventListener(
        "click",
        async event => {

          event.preventDefault();

          event.stopPropagation();


          try {

            await toggleRealtime();

          } catch (error) {

            console.error(
              "ASA voice control:",
              error
            );

          }

        }
      );

    }

  }


  /* =======================================================
     PAGE CLEANUP
  ======================================================= */

  function setupPageCleanup() {

    window.addEventListener(
      "pagehide",
      () => {

        disconnectRealtime(
          true
        );

      }
    );


    window.addEventListener(
      "beforeunload",
      () => {

        disconnectRealtime(
          true
        );

      }
    );

  }


  /* =======================================================
     INIT
  ======================================================= */

  function init() {

    initDOM();

    setupButtons();

    setupPageCleanup();

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once:
          true
      }
    );

  } else {

    init();

  }


  /* =======================================================
     GLOBAL API
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
