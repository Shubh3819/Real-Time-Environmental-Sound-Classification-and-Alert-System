import { useEffect, useRef, useState } from "react";

const BACKEND_URL = "https://real-time-environmental-sound.onrender.com";

const POLL_INTERVAL = 1000; // Predict every 1 second
const WINDOW_SECONDS = 5;   // Send latest 5 seconds to backend


function App() {
  const [listening, setListening] = useState(false);
  const [label, setLabel] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [dangerous, setDangerous] = useState(false);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [history, setHistory] = useState([]);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);

  // Stores continuous microphone audio
  const audioBufferRef = useRef([]);

  // Prediction timer
  const predictionTimerRef = useRef(null);

  // Prevent multiple backend requests at the same time
  const predictionInProgressRef = useRef(false);

  // Canvas
  const canvasRef = useRef(null);
  const animationRef = useRef(null);


  /* =====================================================
     RESET BACKEND MONITORING STATE
  ===================================================== */

  const resetMonitoringState = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/reset-monitoring`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Reset endpoint returned ${response.status}`
        );
      }

      const data = await response.json();

      console.log("🔄 Backend monitoring state reset:", data);

      return true;
    } catch (error) {
      console.error(
        "❌ Could not reset backend monitoring state:",
        error
      );

      return false;
    }
  };


  /* =====================================================
     START MONITORING
  ===================================================== */

  const startRecording = async () => {
    try {
      /*
       * IMPORTANT:
       * Reset backend state before starting a new session.
       *
       * This clears:
       * - prediction buffer
       * - last_alerted_label
       *
       * So the first dangerous sound of every new
       * monitoring session can trigger an alert.
       */

      const resetSuccessful = await resetMonitoringState();

      if (!resetSuccessful) {
        alert(
          "Could not reset the monitoring system. Please make sure the backend is running."
        );

        return;
      }


      /*
       * Reset frontend state.
       */

      setLabel(null);
      setConfidence(null);
      setDangerous(false);
      setAlertTriggered(false);
      setHistory([]);

      audioBufferRef.current = [];
      predictionInProgressRef.current = false;


      /*
       * Ask for microphone permission.
       */

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      streamRef.current = stream;


      /*
       * Create AudioContext.
       */

      const audioContext =
        new AudioContext();

      audioContextRef.current =
        audioContext;


      /*
       * Microphone source.
       */

      const source =
        audioContext.createMediaStreamSource(
          stream
        );

      sourceRef.current = source;


      /*
       * Waveform analyser.
       */

      const analyser =
        audioContext.createAnalyser();

      analyser.fftSize = 2048;

      analyserRef.current =
        analyser;


      /*
       * ScriptProcessorNode is deprecated,
       * but it works well for this project
       * and keeps the implementation simple.
       */

      const processor =
        audioContext.createScriptProcessor(
          4096,
          1,
          1
        );

      processorRef.current =
        processor;


      /*
       * Clear previous audio.
       */

      audioBufferRef.current = [];


      /*
       * Collect microphone audio continuously.
       */

      processor.onaudioprocess = (event) => {
        const input =
          event.inputBuffer.getChannelData(0);

        audioBufferRef.current.push(
          new Float32Array(input)
        );


        /*
         * Keep approximately the latest
         * 6 seconds of audio.
         */

        const maxSamples =
          audioContext.sampleRate *
          (WINDOW_SECONDS + 1);

        let totalSamples =
          audioBufferRef.current.reduce(
            (sum, buffer) =>
              sum + buffer.length,
            0
          );


        while (
          totalSamples > maxSamples &&
          audioBufferRef.current.length > 1
        ) {
          totalSamples -=
            audioBufferRef.current[0].length;

          audioBufferRef.current.shift();
        }
      };


      /*
       * Connect audio pipeline.
       */

      source.connect(analyser);

      analyser.connect(processor);


      /*
       * Connecting to destination keeps
       * ScriptProcessorNode active.
       */

      processor.connect(
        audioContext.destination
      );


      /*
       * Start monitoring.
       */

      setListening(true);


      /*
       * Start waveform.
       */

      drawWaveform();


      /*
       * Start continuous prediction.
       *
       * Every 1 second we send the latest
       * 5 seconds of audio to FastAPI.
       */

      predictionTimerRef.current =
        setInterval(
          predictCurrentWindow,
          POLL_INTERVAL
        );

    } catch (error) {
      console.error(
        "❌ Microphone error:",
        error
      );

      alert(
        "Could not access the microphone. Please allow microphone permission."
      );
    }
  };


  /* =====================================================
     PREDICT CURRENT 5-SECOND WINDOW
  ===================================================== */

  const predictCurrentWindow = async () => {
    const audioContext =
      audioContextRef.current;

    if (!audioContext) {
      return;
    }


    /*
     * Don't start another request if the
     * previous prediction is still running.
     */

    if (
      predictionInProgressRef.current
    ) {
      return;
    }


    const buffers =
      audioBufferRef.current;

    if (
      !buffers ||
      buffers.length === 0
    ) {
      return;
    }


    /*
     * Combine all stored audio.
     */

    const audio =
      flattenBuffers(buffers);


    /*
     * We need a complete 5-second window
     * before sending anything.
     */

    const requiredSamples =
      Math.floor(
        audioContext.sampleRate *
        WINDOW_SECONDS
      );

    if (
      audio.length < requiredSamples
    ) {
      return;
    }


    /*
     * Take only the latest 5 seconds.
     */

    const latestAudio =
      audio.slice(
        audio.length -
          requiredSamples
      );


    /*
     * Create WAV using the browser's
     * actual sample rate.
     *
     * Backend will resample to 22050 Hz.
     */

    const wavBlob =
      encodeWAV(
        latestAudio,
        audioContext.sampleRate
      );


    const formData =
      new FormData();

    formData.append(
      "file",
      wavBlob,
      "audio.wav"
    );


    predictionInProgressRef.current =
      true;


    try {
      const response =
        await fetch(
          `${BACKEND_URL}/predict`,
          {
            method: "POST",
            body: formData,
          }
        );


      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }


      const data =
        await response.json();


      if (data.error) {
        console.error(
          "Backend error:",
          data.error
        );

        return;
      }


      /*
       * Update current prediction.
       */

      setLabel(data.label);

      setConfidence(
        data.confidence
      );


      /*
       * IMPORTANT:
       * Use the backend's dangerous value.
       */

      setDangerous(
        Boolean(data.dangerous)
      );


      /*
       * alert_triggered is true only when
       * the backend actually sends a new
       * ntfy notification.
       */

      setAlertTriggered(
        Boolean(data.alert_triggered)
      );


      /* =================================================
         UPDATE HISTORY
      ================================================= */

      setHistory((previous) => {
        const last =
          previous[0];


        /*
         * Don't add the exact same
         * detection every second.
         */

        if (
          last &&
          last.label === data.label &&
          Date.now() -
            last.timestamp <
            3000
        ) {
          return previous;
        }


        const newDetection = {
          label: data.label,
          confidence:
            data.confidence,
          dangerous:
            Boolean(data.dangerous),
          timestamp:
            Date.now(),
          time:
            new Date().toLocaleTimeString(),
        };


        return [
          newDetection,
          ...previous.slice(0, 4),
        ];
      });

    } catch (error) {
      console.error(
        "❌ Prediction request failed:",
        error
      );

    } finally {
      predictionInProgressRef.current =
        false;
    }
  };


  /* =====================================================
     STOP MONITORING
  ===================================================== */

  const stopRecording = async () => {
    setListening(false);


    /*
     * Stop prediction timer.
     */

    if (
      predictionTimerRef.current
    ) {
      clearInterval(
        predictionTimerRef.current
      );

      predictionTimerRef.current =
        null;
    }


    /*
     * Stop waveform.
     */

    if (
      animationRef.current
    ) {
      cancelAnimationFrame(
        animationRef.current
      );

      animationRef.current =
        null;
    }


    /*
     * Disconnect audio nodes.
     */

    try {
      if (
        processorRef.current
      ) {
        processorRef.current.disconnect();

        processorRef.current.onaudioprocess =
          null;
      }


      if (
        analyserRef.current
      ) {
        analyserRef.current.disconnect();
      }


      if (
        sourceRef.current
      ) {
        sourceRef.current.disconnect();
      }

    } catch (error) {
      console.error(
        "Audio cleanup error:",
        error
      );
    }


    /*
     * Stop microphone.
     */

    if (
      streamRef.current
    ) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current =
        null;
    }


    /*
     * Close AudioContext.
     */

    if (
      audioContextRef.current
    ) {
      try {
        await audioContextRef.current.close();

      } catch (error) {
        console.error(
          "AudioContext close error:",
          error
        );
      }

      audioContextRef.current =
        null;
    }


    /*
     * Clear references.
     */

    processorRef.current =
      null;

    analyserRef.current =
      null;

    sourceRef.current =
      null;

    audioBufferRef.current =
      [];

    predictionInProgressRef.current =
      false;


    /*
     * IMPORTANT:
     *
     * Reset backend AFTER stopping.
     *
     * This means:
     *
     * START
     *   ↓
     * reset backend
     *   ↓
     * monitoring
     *   ↓
     * dangerous sound detected
     *   ↓
     * ntfy alert
     *   ↓
     * STOP
     *   ↓
     * reset backend
     *
     * The next START therefore begins
     * with a completely fresh session.
     */

    await resetMonitoringState();
  };


  /* =====================================================
     WAVEFORM
  ===================================================== */

  const drawWaveform = () => {
    const canvas =
      canvasRef.current;

    const analyser =
      analyserRef.current;

    if (
      !canvas ||
      !analyser
    ) {
      return;
    }


    const ctx =
      canvas.getContext("2d");

    const bufferLength =
      analyser.frequencyBinCount;

    const dataArray =
      new Uint8Array(
        bufferLength
      );


    const draw = () => {
      if (
        !analyserRef.current
      ) {
        return;
      }


      analyser.getByteTimeDomainData(
        dataArray
      );


      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );


      ctx.lineWidth = 2;

      ctx.strokeStyle =
        "#00ffd5";

      ctx.beginPath();


      const sliceWidth =
        canvas.width /
        bufferLength;

      let x = 0;


      for (
        let i = 0;
        i < bufferLength;
        i++
      ) {
        const v =
          dataArray[i] /
          128.0;

        const y =
          (v *
            canvas.height) /
          2;


        if (i === 0) {
          ctx.moveTo(
            x,
            y
          );

        } else {
          ctx.lineTo(
            x,
            y
          );
        }


        x += sliceWidth;
      }


      ctx.lineTo(
        canvas.width,
        canvas.height / 2
      );

      ctx.stroke();


      animationRef.current =
        requestAnimationFrame(
          draw
        );
    };


    draw();
  };


  /* =====================================================
     CLEANUP WHEN COMPONENT UNMOUNTS
  ===================================================== */

  useEffect(() => {
    return () => {

      /*
       * Stop prediction timer.
       */

      if (
        predictionTimerRef.current
      ) {
        clearInterval(
          predictionTimerRef.current
        );
      }


      /*
       * Stop waveform animation.
       */

      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }


      /*
       * Stop microphone.
       */

      if (
        streamRef.current
      ) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }


      /*
       * Close AudioContext.
       */

      if (
        audioContextRef.current
      ) {
        audioContextRef.current.close();
      }


      /*
       * Reset backend state.
       *
       * We intentionally do not await this
       * because React cleanup cannot wait
       * for an async operation.
       */

      fetch(
        `${BACKEND_URL}/reset-monitoring`,
        {
          method: "POST",
        }
      ).catch((error) => {
        console.error(
          "Could not reset backend during cleanup:",
          error
        );
      });
    };
  }, []);


  /* =====================================================
     UI
  ===================================================== */

  return (
    <div style={styles.page}>

      <div style={styles.card}>

        <h1 style={styles.title}>
          Environmental Sound Monitor
        </h1>


        <p style={styles.subtitle}>
          Real-time environmental sound detection
        </p>


        {/* START / STOP BUTTON */}

        <button
          onClick={
            listening
              ? stopRecording
              : startRecording
          }
          style={{
            ...styles.button,
            background:
              listening
                ? "#ff4d4d"
                : "#00c896",
          }}
        >
          {listening
            ? "Stop Monitoring"
            : "Start Monitoring"}
        </button>


        {/* STATUS */}

        <div style={styles.status}>

          <span
            style={{
              ...styles.statusDot,
              background:
                listening
                  ? "#00ff88"
                  : "#777",
            }}
          />

          {listening
            ? "Microphone active"
            : "Monitoring stopped"}

        </div>


        {/* WAVEFORM */}

        <canvas
          ref={canvasRef}
          width={500}
          height={120}
          style={{
            marginTop: 25,
            width: "100%",
            display:
              listening
                ? "block"
                : "none",
            borderRadius: 12,
            background:
              "rgba(0,0,0,0.2)",
          }}
        />


        {/* CURRENT RESULT */}

        {label && (
          <div
            style={{
              ...styles.result,
              borderColor:
                dangerous
                  ? "#ff4d4d"
                  : "#00c896",
              background:
                dangerous
                  ? "rgba(255,77,77,0.12)"
                  : "rgba(0,200,150,0.10)",
            }}
          >

            <div
              style={
                styles.resultHeader
              }
            >

              <h2
                style={
                  styles.resultTitle
                }
              >
                {label.toUpperCase()}
              </h2>


              {dangerous && (
                <span
                  style={
                    styles.warning
                  }
                >
                  ⚠ DANGER
                </span>
              )}

            </div>


            <p
              style={
                styles.confidence
              }
            >
              {(
                confidence * 100
              ).toFixed(1)}
              %
            </p>


            <p
              style={
                styles.confidenceLabel
              }
            >
              Confidence
            </p>


            {alertTriggered && (
              <div
                style={
                  styles.alertMessage
                }
              >
                🔔 Alert sent to your device
              </div>
            )}

          </div>
        )}


        {/* HISTORY */}

        {history.length > 0 && (
          <div
            style={styles.history}
          >

            <h3>
              Recent Detections
            </h3>


            {history.map(
              (item, index) => (
                <div
                  key={index}
                  style={
                    styles.historyItem
                  }
                >

                  <span>
                    {item.time}
                  </span>


                  <strong
                    style={{
                      color:
                        item.dangerous
                          ? "#ff6b6b"
                          : "#fff",
                    }}
                  >
                    {item.label}
                  </strong>


                  <span>
                    {(
                      item.confidence *
                      100
                    ).toFixed(0)}
                    %
                  </span>

                </div>
              )
            )}

          </div>
        )}


        {/* INFORMATION */}

        {listening && (
          <p
            style={styles.info}
          >
            Analyzing the latest
            5 seconds of audio
            every second...
          </p>
        )}

      </div>

    </div>
  );
}


/* =====================================================
   STYLES
===================================================== */

const styles = {

  page: {
    minHeight: "100vh",

    background:
      "radial-gradient(circle at top, #1f3c47, #0a1f28)",

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    color: "#fff",

    padding: 20,

    boxSizing: "border-box",
  },


  card: {
    width: "100%",

    maxWidth: 600,

    padding: 40,

    borderRadius: 20,

    background:
      "rgba(255,255,255,0.08)",

    backdropFilter:
      "blur(15px)",

    boxShadow:
      "0 30px 60px rgba(0,0,0,0.5)",

    textAlign: "center",
  },


  title: {
    marginBottom: 8,

    letterSpacing: 1,
  },


  subtitle: {
    marginTop: 0,

    marginBottom: 30,

    color:
      "rgba(255,255,255,0.65)",
  },


  button: {
    padding:
      "14px 36px",

    borderRadius: 30,

    fontSize: 18,

    border: "none",

    color: "#fff",

    cursor: "pointer",

    fontWeight: 600,
  },


  status: {
    marginTop: 15,

    fontSize: 14,

    color:
      "rgba(255,255,255,0.7)",

    display: "flex",

    justifyContent: "center",

    alignItems: "center",

    gap: 8,
  },


  statusDot: {
    width: 9,

    height: 9,

    borderRadius: "50%",

    display: "inline-block",
  },


  result: {
    marginTop: 30,

    padding: 24,

    borderRadius: 16,

    border: "3px solid",

    color: "#fff",

    transition:
      "all 0.3s ease",
  },


  resultHeader: {
    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    gap: 12,
  },


  resultTitle: {
    margin: 0,
  },


  warning: {
    fontSize: 13,

    fontWeight: 700,

    color: "#ff6b6b",
  },


  confidence: {
    fontSize: 38,

    fontWeight: 700,

    margin:
      "10px 0 0",
  },


  confidenceLabel: {
    margin: 0,

    color:
      "rgba(255,255,255,0.6)",
  },


  alertMessage: {
    marginTop: 15,

    padding: 10,

    borderRadius: 10,

    background:
      "rgba(255,255,255,0.08)",

    fontSize: 14,
  },


  history: {
    marginTop: 30,

    textAlign: "left",
  },


  historyItem: {
    display: "flex",

    justifyContent:
      "space-between",

    alignItems: "center",

    padding:
      "10px 0",

    borderBottom:
      "1px solid rgba(255,255,255,0.2)",
  },


  info: {
    marginTop: 20,

    fontSize: 13,

    color:
      "rgba(255,255,255,0.5)",
  },
};


/* =====================================================
   WAV ENCODER
===================================================== */

function encodeWAV(
  audio,
  sampleRate
) {
  const wav =
    new ArrayBuffer(
      44 +
        audio.length * 2
    );

  const view =
    new DataView(wav);


  /*
   * RIFF
   */

  writeString(
    view,
    0,
    "RIFF"
  );


  view.setUint32(
    4,
    36 +
      audio.length * 2,
    true
  );


  /*
   * WAVE
   */

  writeString(
    view,
    8,
    "WAVE"
  );


  /*
   * fmt
   */

  writeString(
    view,
    12,
    "fmt "
  );


  view.setUint32(
    16,
    16,
    true
  );


  /*
   * PCM format
   */

  view.setUint16(
    20,
    1,
    true
  );


  /*
   * Mono
   */

  view.setUint16(
    22,
    1,
    true
  );


  /*
   * Sample rate
   */

  view.setUint32(
    24,
    sampleRate,
    true
  );


  /*
   * Byte rate
   */

  view.setUint32(
    28,
    sampleRate * 2,
    true
  );


  /*
   * Block align
   */

  view.setUint16(
    32,
    2,
    true
  );


  /*
   * Bits per sample
   */

  view.setUint16(
    34,
    16,
    true
  );


  /*
   * data
   */

  writeString(
    view,
    36,
    "data"
  );


  view.setUint32(
    40,
    audio.length * 2,
    true
  );


  /*
   * Audio data
   */

  floatTo16BitPCM(
    view,
    44,
    audio
  );


  return new Blob(
    [view],
    {
      type: "audio/wav",
    }
  );
}


/* =====================================================
   FLATTEN AUDIO BUFFERS
===================================================== */

function flattenBuffers(
  buffers
) {
  const length =
    buffers.reduce(
      (sum, buffer) =>
        sum + buffer.length,
      0
    );


  const result =
    new Float32Array(
      length
    );


  let offset = 0;


  buffers.forEach(
    (buffer) => {
      result.set(
        buffer,
        offset
      );

      offset +=
        buffer.length;
    }
  );


  return result;
}


/* =====================================================
   CONVERT FLOAT32 → 16-BIT PCM
===================================================== */

function floatTo16BitPCM(
  view,
  offset,
  input
) {
  for (
    let i = 0;
    i < input.length;
    i++,
    offset += 2
  ) {
    const sample =
      Math.max(
        -1,
        Math.min(
          1,
          input[i]
        )
      );


    view.setInt16(
      offset,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true
    );
  }
}


/* =====================================================
   WRITE STRING INTO WAV
===================================================== */

function writeString(
  view,
  offset,
  string
) {
  for (
    let i = 0;
    i < string.length;
    i++
  ) {
    view.setUint8(
      offset + i,
      string.charCodeAt(i)
    );
  }
}


export default App;
