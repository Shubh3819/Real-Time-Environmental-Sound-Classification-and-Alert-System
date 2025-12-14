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
project-root/
│
├── backend/
│ ├── app.py
│ ├── model_utils.py
│ ├── audio_utils.py
│ ├── alert.py
│ ├── model/
│ │ ├── esc50_crnn_model.h5
│ │ └── label_encoder.pkl
│ └── .env
│
├── frontend/
│ ├── src/
│ │ └── App.js
│ └── package.json
│ 
├── README.md
└── .gitignore


## Setup Instructions
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
