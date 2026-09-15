import numpy as np
import librosa


def extract_mel_spectrogram(y, sr=22050):

    if len(y) == 0:
        return None

    # Same preprocessing used during training
    S = librosa.feature.melspectrogram(
        y=y,
        sr=sr,
        n_mels=128
    )

    log_S = librosa.power_to_db(
        S,
        ref=np.max
    )

    log_S = librosa.util.fix_length(
        log_S,
        size=216,
        axis=1
    )

    log_S = librosa.util.normalize(log_S)

    return log_S.T[..., np.newaxis]