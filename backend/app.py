from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import numpy as np
import io
import librosa

from collections import deque

from model_utils import get_model_and_encoder
from audio_utils import extract_mel_spectrogram
from alert import send_alert


app = FastAPI()


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# LABELS
# ============================================================

LABEL_MAP = {
    "water_drops": "Rain",
    "pouring_water": "Rain",
    "POURING WATER": "Rain",
    "thunderstorm": "Thunderstorm",
    "rain": "Rain",
    "fire_crackling": "Fire",
    "wind": "Strong Wind",
    "siren": "Siren",
    "silence": "Silence"
}


# Sounds that should trigger an alert
DANGEROUS_SOUNDS = {
    "thunderstorm",
    "fire_crackling",
    "wind",
    "siren"
}


# ============================================================
# CONFIGURATION
# ============================================================

CONF_THRESHOLD = 0.75

SR = 22050
CLIP_SECONDS = 5
TARGET_SAMPLES = SR * CLIP_SECONDS


# ============================================================
# TEMPORAL STATE
# ============================================================

# Store the last 3 predictions
prediction_buffer = deque(maxlen=3)

# Prevent repeated alerts for the same ongoing sound
last_alerted_label = None

@app.post("/reset-monitoring")
def reset_monitoring():
    global last_alerted_label

    prediction_buffer.clear()
    last_alerted_label = None

    print("🔄 Monitoring state reset")

    return {
        "success": True,
        "message": "Monitoring state reset"
    }


# ============================================================
# PREDICTION ENDPOINT
# ============================================================

@app.post("/predict")
async def predict(file: UploadFile):

    global last_alerted_label

    try:

        print("📩 Request received")

        # ----------------------------------------------------
        # LOAD AUDIO
        # ----------------------------------------------------

        audio_bytes = await file.read()

        print("Audio bytes:", len(audio_bytes))

        y, sr = librosa.load(
            io.BytesIO(audio_bytes),
            sr=SR,
            mono=True
        )


        # ----------------------------------------------------
        # FIX AUDIO LENGTH
        # ----------------------------------------------------

        if len(y) < TARGET_SAMPLES:

            y = np.pad(
                y,
                (0, TARGET_SAMPLES - len(y))
            )

        else:

            y = y[:TARGET_SAMPLES]


        # ----------------------------------------------------
        # SILENCE CHECK
        # ----------------------------------------------------

        rms = np.sqrt(np.mean(y ** 2))

        if rms < 0.01:

            prediction_buffer.clear()
            last_alerted_label = None

            return {
                "label": "silence",
                "confidence": 0.0,
                "dangerous": False,
                "alert_triggered": False
            }


        # ----------------------------------------------------
        # FEATURE EXTRACTION
        # ----------------------------------------------------

        features = extract_mel_spectrogram(y)

        if features is None:

            prediction_buffer.clear()
            last_alerted_label = None

            return {
                "label": "silence",
                "confidence": 0.0,
                "dangerous": False,
                "alert_triggered": False
            }


        # Add batch dimension

        features = np.expand_dims(
            features,
            axis=0
        )


        # ----------------------------------------------------
        # MODEL PREDICTION
        # ----------------------------------------------------

        model, label_encoder = get_model_and_encoder()

        preds = model.predict(
            features,
            verbose=0
        )[0]


        idx = int(np.argmax(preds))

        confidence = float(preds[idx])

        label = label_encoder.inverse_transform(
            [idx]
        )[0]


        print(
            f"Prediction: {label} | "
            f"Confidence: {confidence:.2%}"
        )


        # ----------------------------------------------------
        # TEMPORAL SMOOTHING
        # ----------------------------------------------------

        prediction_buffer.append(
            (label, confidence)
        )


        confident_predictions = [
            (l, c)
            for l, c in prediction_buffer
            if c >= CONF_THRESHOLD
        ]


        final_label = label
        final_confidence = confidence


        # Require 3 confident predictions

        if len(confident_predictions) == 3:

            candidate_labels = [
                l for l, c in confident_predictions
            ]


            most_common_label = max(
                set(candidate_labels),
                key=candidate_labels.count
            )


            count = candidate_labels.count(
                most_common_label
            )


            if count >= 3:

                final_label = most_common_label

                final_confidence = max(
                    c
                    for l, c in confident_predictions
                    if l == most_common_label
                )


        # ----------------------------------------------------
        # DANGER DETECTION
        # ----------------------------------------------------

        confirmed_dangerous = (
            final_label in DANGEROUS_SOUNDS
            and len(confident_predictions) == 3
            and final_confidence >= CONF_THRESHOLD
            and all(
                l == final_label
                for l, c in confident_predictions
            )
        )


        # ----------------------------------------------------
        # ALERT
        # ----------------------------------------------------

        alert_triggered = False


        if confirmed_dangerous:

            # Only send once for an ongoing dangerous event

            if last_alerted_label != final_label:

                success = send_alert(
                    final_label,
                    final_confidence
                )

                if success:
                    last_alerted_label = final_label
                    alert_triggered = True

        else:

            # Dangerous event ended
            last_alerted_label = None


        # ----------------------------------------------------
        # RESPONSE
        # ----------------------------------------------------

        return {

            "label": LABEL_MAP.get(
                final_label,
                final_label
            ),

            "raw_label": final_label,

            "confidence": final_confidence,

            "dangerous": confirmed_dangerous,

            "alert_triggered": alert_triggered

        }


    except Exception as e:

        print("❌ Error:", e)

        return {
            "error": str(e)
        }