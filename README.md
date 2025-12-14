A full-stack real time environmental sound monitoring system that listens to live microphone audio, classifies sounds using a deep learning model (CRNN with Attention), visualizes waveforms, maintains detection history, and sends alert notifications for dangerous sounds.

## Features

- Real-time microphone recording (browser-based)
- Deep Learning audio classification(CRNN + Attention)
- Live waveform visualization
- Prediction history timeline
- Dangerous sound detection with confidence threshold
- Email alert notifications
- Modern UI with visual danger indicators
- Temporal smoothing to reduce false alerts

## Model Details

- **Dataset**: ESC-50 Environmental Sound Dataset
- **Architecture**:
  - CNN for spatial feature extraction (Mel Spectrograms)
  - Bi-GRU for temporal modeling
  - Attention mechanism for temporal focus
- **Input**: 5-second audio clips (22050 Hz)
- **Output**: 50 environmental sound classes


##  Dangerous Sounds Detected

The system triggers alerts for the following sounds:

- Fire crackling
- Thunderstorm
- Rain / Water flow
- Strong wind
- Siren

(Labels follow ESC-50 naming internally and are mapped to human-friendly names in the UI.)

##  Tech Stack

### Frontend
- React
- Web Audio API
- Canvas API (waveform visualization)

### Backend
- FastAPI
- TensorFlow / Keras
- Librosa
- NumPy

### ML / Audio
- CRNN (CNN + Bi-GRU)
- Attention Layer
- Mel Spectrograms


## Project Structure
project-root/<br>
│
├── backend/<br>
│ ├─ ─ app.py<br>
│ ├─ ─ model_utils.py<br>
│ ├─ ─ audio_utils.py<br>
│ ├─ ─ alert.py<br>
│ ├─ ─ model/<br>
│ │ ├─ ─ ─ esc50_crnn_model.h5<br>
│ │ └─ ─ ─ label_encoder.pkl<br>
│ └ ── .env<br>
│
├── frontend/<br>
│ ├─ ─ src/<br>
│ │ └─ ─ ─ App.js<br>
│ └─ ─ ─ package.json<br>
│ 
├── README.md<br>
└── .gitignore<br>


## Setup Instructions
- git clone "URL OF THE REPO"

###  Backend Setup
- cd backend
- pip install -r requirements.txt

###  Frontend Setup
- cd frontend
- npm install

#### Run Backend
- uvicorn app:app --reload

#### Run Frontend
- npm start

## .env
- EMAIL_SENDER=your_email@gmail.com
- EMAIL_PASSWORD=your_app_password
- EMAIL_RECEIVER=your_email@gmail.com
(For App Password you need to setup app password in Google Accounts->App Passwords->Setup)

##Backend Port=http://localhost:8000
##Frontend Port=http://localhost:3000

**Email Alerts**
- Alerts are sent only when:
- Sound is classified as dangerous
- Confidence exceeds threshold(>0.75)
- Same sound is detected consistently (temporal smoothing)
- This prevents false positives.

**Future Improvements**
- Push notifications (mobile)
- Docker deployment
- Cloud inference
- Multi-microphone support
- Custom retraining interface

<img width="1920" height="1008" alt="Screenshot 2025-12-14 215006" src="https://github.com/user-attachments/assets/a7224f97-8a22-410e-85c8-f2cbb336993a" />

<img width="1920" height="1008" alt="Screenshot 2025-12-14 225118" src="https://github.com/user-attachments/assets/cf0e124d-be3c-41f3-b570-aa78c4bed631" />

![emailAlert](https://github.com/user-attachments/assets/9bcf817a-bc1c-4cce-9223-b068477a454f)



