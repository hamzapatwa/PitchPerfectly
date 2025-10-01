# Minimal analysis stub: extracts beats, rough phrases, pitch contour with librosa;
# CREPE integration is sketched for later (commented).

import json, sys, uuid, numpy as np
import soundfile as sf
import librosa

def extract(audio_path, out_json):
    y, sr = librosa.load(audio_path, sr=16000, mono=True)
    # Tempo / beats
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=True)
    beat_times = librosa.frames_to_time(beats, sr=sr)

    # Onsets (phrase markers via novelty peaks)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    onset_times = librosa.frames_to_time(onsets, sr=sr)

    # Phrases as 2-beat windows grouped between onsets (simple heuristic)
    phrases = []
    cur = 0.0
    for t in onset_times:
        if t - cur > 1.0:
            phrases.append({"start": float(cur), "end": float(t)})
            cur = t
    if len(phrases)==0 and len(beat_times)>1:
        phrases = [{"start": float(beat_times[i]), "end": float(beat_times[i+4])} for i in range(0, max(1,len(beat_times)-5), 4)]

    # Pitch contour (librosa yin as a placeholder; swap to CREPE later)
    f0 = librosa.yin(y, fmin=50, fmax=1000, sr=sr, frame_length=2048, hop_length=320)  # ~20ms hop
    f0 = np.nan_to_num(f0, nan=0.0).astype(float).tolist()

    # Key estimate (rough)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = chroma.sum(axis=1).argmax()
    key_name = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][int(key_idx)]

    # Loudness proxy (RMS)
    S = librosa.feature.rms(y=y, frame_length=2048, hop_length=320)[0]
    loud = S.astype(float).tolist()

    ref = {
        "beats": beat_times.astype(float).tolist(),
        "downbeats": [],
        "phrases": phrases,
        "refPitchHz": f0,
        "key": key_name,
        "sections": [],
        "loudness": loud
    }
    with open(out_json, "w") as f:
        json.dump(ref, f)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: python analyze.py <audio_path> <out_json>")
        sys.exit(1)
    extract(sys.argv[1], sys.argv[2])