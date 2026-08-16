/* =========================================================
   ASA REALTIME VOICE
   WebRTC + OpenAI Realtime
   iPhone / Safari uyumlu
========================================================= */

(() => {
  "use strict";

  let peer = null;
  let microphone = null;
  let dataChannel = null;

  let connected = false;
  let connecting = false;

  let voiceButton = null;
  let voiceClose = null;
  let voiceControl = null;
  let voiceMode = null;
  let voiceStatus = null;
  let remoteAudio = null;

  /* =======================================================
     DOM
  ======================================================= */

  function initDOM() {
    voiceButton = document.getElementById("voiceButton");
    voiceClose = document.getElementById("voiceClose");
    voiceControl = document.getElementById("voiceControl");
    voiceMode = document.getElementById("voiceMode");
    voiceStatus = document.getElementById("voiceStatus");
    remoteAudio = document.getElementById("remoteAudio");
  }

  /* =======================================================
     STATUS
  ======================================================= */

  function setStatus(text) {
    if (voiceStatus) {
      voiceStatus.textContent = text;
    }
  }

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
      voiceMode.classList.add(state);
    }
  }

  /* =======================================================
     VOICE SETTING
  ======================================================= */

  function getSelectedVoice() {
    return (
      localStorage.getItem("asa_voice_v4") ||
      "marin"
    );
  }

  /* =======================================================
     CLIENT SECRET
  ======================================================= */

  async function getClientSecret() {
    const response = await fetch(
      "/api/realtime",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          voice: getSelectedVoice()
        })
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Realtime sunucusundan geçersiz cevap geldi."
      );
    }

    if (
      !response.ok ||
      !data ||
      !data.success ||
      !data.clientSecret
    ) {
      throw new Error(
        data?.error ||
        "Realtime client secret alınamadı."
      );
    }

    return data.clientSecret;
  }

  /* =======================================================
     REALTIME EVENTS
  ======================================================= */

  function sendEvent(event) {
    if (
      !dataChannel ||
      dataChannel.readyState !== "open"
    ) {
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
     EVENT HANDLER
  ======================================================= */

  function handleEvent(event) {
    if (!event) {
      return;
    }

    console.log(
      "ASA REALTIME EVENT:",
      event
    );

    switch (event.type) {

      case "session.created":
        setStatus("Seni dinliyorum...");
        setState("listening");
        break;

      case "session.updated":
        setStatus("Seni dinliyorum...");
        setState("listening");
        break;

      case "input_audio_buffer.speech_started":
        setStatus("Dinliyorum...");
        setState("listening");
        break;

      case "input_audio_buffer.speech_stopped":
        setStatus("Düşünüyorum...");
        break;

      case "response.created":
        setStatus("ASA düşünüyor...");
        break;

      case "response.output_audio.started":
        setStatus("ASA konuşuyor...");
        setState("speaking");
        break;

      case "response.output_audio.delta":
        setStatus("ASA konuşuyor...");
        setState("speaking");
        break;

      case "response.audio.delta":
        setStatus("ASA konuşuyor...");
        setState("speaking");
        break;

      case "response.output_audio.done":
        setStatus("Seni dinliyorum...");
        setState("listening");
        break;

      case "response.done":
        setStatus("Seni dinliyorum...");
        setState("listening");
        break;

      case "error":
        console.error(
          "ASA REALTIME SERVER ERROR:",
          event
        );

        setStatus(
          event.error?.message ||
          "Ses bağlantısında hata oluştu."
        );

        setState(null);
        break;
    }
  }

  /* =======================================================
     CONNECTION
  ======================================================= */

  async function connectRealtime() {

    if (connected || connecting) {
      return;
    }

    connecting = true;

    setStatus("ASA bağlanıyor...");
    setState("connecting");

    try {

      /* ---------------------------------------------------
         1. Client secret
      --------------------------------------------------- */

      const clientSecret =
        await getClientSecret();


      /* ---------------------------------------------------
         2. PeerConnection
      --------------------------------------------------- */

      peer =
        new RTCPeerConnection();


      /* ---------------------------------------------------
         3. Remote audio
      --------------------------------------------------- */

      peer.ontrack = async event => {

        console.log(
          "ASA: remote audio geldi."
        );

        if (
          !remoteAudio ||
          !event.streams ||
          !event.streams[0]
        ) {
          return;
        }

        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;

        try {
          await remoteAudio.play();
        } catch (error) {
          console.warn(
            "ASA audio play:",
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

      microphone =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

      microphone
        .getTracks()
        .forEach(track => {
          peer.addTrack(
            track,
            microphone
          );
        });


      /* ---------------------------------------------------
         5. Data channel
      --------------------------------------------------- */

      dataChannel =
        peer.createDataChannel(
          "oai-events"
        );

      dataChannel.onopen = () => {

        console.log(
          "ASA REALTIME DATA CHANNEL OPEN"
        );

        connected = true;
        connecting = false;

        setStatus(
          "Seni dinliyorum..."
        );

        setState(
          "listening"
        );


        /*
          Oturum ayarları.
        */

        sendEvent({
          type: "session.update",

          session: {
            type: "realtime",

            audio: {
              input: {
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500
                }
              },

              output: {
                voice: getSelectedVoice()
              }
            },

            input_audio_transcription: {
              model: "gpt-4o-mini-transcribe"
            }
          }
        });
      };


      dataChannel.onmessage =
        event => {

          try {

            const data =
              JSON.parse(
                event.data
              );

            handleEvent(data);

          } catch (error) {

            console.error(
              "ASA Realtime event parse:",
              error
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
         6. SDP OFFER
      --------------------------------------------------- */

      const offer =
        await peer.createOffer();

      await peer.setLocalDescription(
        offer
      );


      /* ---------------------------------------------------
         7. ICE
      --------------------------------------------------- */

      await waitForIce(peer);


      /* ---------------------------------------------------
         8. OPENAI REALTIME
      --------------------------------------------------- */

      const sdp =
        peer.localDescription?.sdp;

      if (
        !sdp ||
        typeof sdp !== "string"
      ) {
        throw new Error(
          "WebRTC SDP oluşturulamadı."
        );
      }


      /*
        ÖNEMLİ:

        Burada eski kodda kullanılan:

        new Blob(...)

        KULLANILMIYOR.

        SDP doğrudan string olarak
        application/sdp gönderiliyor.
      */

      const response =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${clientSecret}`,

              "Content-Type":
                "application/sdp"
            },

            body: sdp
          }
        );


      const answer =
        await response.text();


      if (!response.ok) {

        console.error(
          "ASA REALTIME HTTP:",
          response.status,
          answer
        );

        throw new Error(
          answer ||
          `Realtime HTTP ${response.status}`
        );
      }


      /* ---------------------------------------------------
         9. SDP ANSWER
      --------------------------------------------------- */

      if (
        !answer ||
        typeof answer !== "string"
      ) {
        throw new Error(
          "OpenAI geçerli bir SDP cevabı göndermedi."
        );
      }


      await peer.setRemoteDescription({
        type: "answer",
        sdp: answer
      });


      console.log(
        "ASA REALTIME SDP BAĞLANTISI TAMAMLANDI"
      );


      /* ---------------------------------------------------
         10. CONNECTION STATE
      --------------------------------------------------- */

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

              connected = true;
              connecting = false;

              setStatus(
                "Seni dinliyorum..."
              );

              setState(
                "listening"
              );

              break;


            case "disconnected":

              connected = false;

              setStatus(
                "Bağlantı kesildi."
              );

              setState(null);

              break;


            case "failed":

              connected = false;
              connecting = false;

              setStatus(
                "Ses bağlantısı kurulamadı."
              );

              setState(null);

              break;


            case "closed":

              connected = false;
              connecting = false;

              setStatus(
                "Bağlantı kapandı."
              );

              setState(null);

              break;
          }
        };


    } catch (error) {

      console.error(
        "ASA REALTIME CONNECT ERROR:",
        error
      );

      connected = false;
      connecting = false;

      setState(null);

      setStatus(
        error?.message ||
        "Ses bağlantısı kurulamadı."
      );

      await disconnectRealtime();
    }
  }


  /* =======================================================
     ICE WAIT
  ======================================================= */

  function waitForIce(connection) {

    return new Promise(resolve => {

      if (
        connection.iceGatheringState ===
        "complete"
      ) {
        resolve();
        return;
      }

      let finished = false;

      const finish = () => {

        if (finished) {
          return;
        }

        finished = true;

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
    });
  }


  /* =======================================================
     DISCONNECT
  ======================================================= */

  async function disconnectRealtime() {

    connected = false;
    connecting = false;


    if (dataChannel) {

      try {
        dataChannel.close();
      } catch {}

      dataChannel = null;
    }


    if (microphone) {

      microphone
        .getTracks()
        .forEach(track => {

          try {
            track.stop();
          } catch {}

        });

      microphone = null;
    }


    if (peer) {

      try {
        peer.close();
      } catch {}

      peer = null;
    }


    if (remoteAudio) {

      try {
        remoteAudio.pause();
      } catch {}

      remoteAudio.srcObject = null;
    }
  }


  /* =======================================================
     OPEN
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
     CLOSE
  ======================================================= */

  async function closeVoiceMode() {

    await disconnectRealtime();

    if (voiceMode) {
      voiceMode.classList.remove(
        "open"
      );
    }

    setState(null);

    setStatus(
      "Hazırım"
    );
  }


  /* =======================================================
     TOGGLE
  ======================================================= */

  async function toggleRealtime() {

    if (connected) {

      await disconnectRealtime();

      setStatus(
        "Mikrofon kapalı"
      );

      setState(null);

      return;
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


    /*
      onclick yerine addEventListener
      kullanıyoruz.
    */

    voiceButton.addEventListener(
      "click",
      async event => {

        event.preventDefault();
        event.stopPropagation();

        await openVoiceMode();
      }
    );


    if (voiceClose) {

      voiceClose.addEventListener(
        "click",
        async event => {

          event.preventDefault();
          event.stopPropagation();

          await closeVoiceMode();
        }
      );
    }


    if (voiceControl) {

      voiceControl.addEventListener(
        "click",
        async event => {

          event.preventDefault();
          event.stopPropagation();

          await toggleRealtime();
        }
      );
    }
  }


  /* =======================================================
     INIT
  ======================================================= */

  function init() {

    setupButtons();

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
      { once: true }
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
