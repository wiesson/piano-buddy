# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "torch==2.8.*",
#   "torchaudio==2.8.*",
#   "demucs>=4.0.1",
#   "piano-transcription-inference>=0.0.6",
#   "torchcrepe>=0.0.23",
#   "librosa>=0.10",
#   "mido>=1.3",
#   "soundfile",
#   "audioread",
#   "numpy<2.3",
# ]
# ///
"""
Song (Audio) -> MIDI für den Import in Piano Buddy. Nur für Demos mit Material, an dem wir die
Rechte klären; die Ausgabe nicht veröffentlichen.

Ablauf:
  1. Demucs (htdemucs_6s) trennt Klavier und Gesang.
  2. Klavier-Spur -> Noten mit ByteDance Piano Transcription (inkl. Anschlag und Dauer).
  3. Gesang -> Melodielinie mit CREPE (Grundfrequenz), in Töne zerlegt.
  4. Beat-Tracking auf dem Original: Alle Zeiten werden auf Schläge umgerechnet, damit das
     Sechzehntel-Raster des Imports trifft, auch wenn das Tempo leicht schwankt.
  5. Eine MIDI-Datei mit zwei Spuren: „Melodie“ (Gesang) und „Klavier“.

Aufruf:
  uv run tools/transcribe-song.py --warmup              # Modelle vorab laden
  uv run tools/transcribe-song.py song.m4a -o out/      # -> out/<name>.mid
Optionen: --meter 4 (Schläge pro Takt), --skip-beats N (Auftakt: so viele Schläge vor Takt 1)
"""

import argparse
import sys
import tempfile
from pathlib import Path

import numpy as np


def separate(audio: Path, work: Path) -> dict[str, Path]:
    from demucs.separate import main as demucs_main

    demucs_main(["-n", "htdemucs_6s", "-o", str(work), str(audio)])
    stems = work / "htdemucs_6s" / audio.stem
    return {name: stems / f"{name}.wav" for name in ("piano", "vocals")}


def piano_notes(wav: Path) -> list[tuple[float, float, int, int]]:
    """(start s, end s, midi, velocity)"""
    import librosa
    import torch
    from piano_transcription_inference import PianoTranscription, sample_rate

    audio, _ = librosa.load(str(wav), sr=sample_rate, mono=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    try:
        tr = PianoTranscription(device=device)
    except Exception:
        tr = PianoTranscription(device="cpu")
    with tempfile.NamedTemporaryFile(suffix=".mid") as tmp:
        result = tr.transcribe(audio, tmp.name)
    return [
        (e["onset_time"], e["offset_time"], int(e["midi_note"]), int(e["velocity"]))
        for e in result["est_note_events"]
    ]


def melody_notes(wav: Path) -> list[tuple[float, float, int, int]]:
    """Einstimmige Melodie aus dem Gesang: CREPE-Tonhöhe, stabile Abschnitte werden Töne."""
    import librosa
    import torch
    import torchcrepe

    sr = 16000
    hop = 160  # 10 ms
    audio, _ = librosa.load(str(wav), sr=sr, mono=True)
    x = torch.tensor(audio)[None]
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    f0, periodicity = torchcrepe.predict(
        x, sr, hop, 65.0, 1000.0, "full", batch_size=1024, device=device, return_periodicity=True
    )
    periodicity = torchcrepe.filter.median(periodicity, 3)
    f0 = torchcrepe.filter.mean(f0, 5)
    f0 = f0[0].cpu().numpy()
    per = periodicity[0].cpu().numpy()
    rms = librosa.feature.rms(y=audio, frame_length=1024, hop_length=hop)[0]
    rms = np.pad(rms, (0, max(0, len(f0) - len(rms))))[: len(f0)]

    voiced = (per > 0.5) & (rms > 0.01)
    pitch = np.where(voiced, np.round(librosa.hz_to_midi(np.maximum(f0, 1e-3))), -1).astype(int)

    notes = []
    dt = hop / sr
    i = 0
    while i < len(pitch):
        if pitch[i] < 0:
            i += 1
            continue
        j = i
        while j + 1 < len(pitch) and pitch[j + 1] == pitch[i]:
            j += 1
        start, end = i * dt, (j + 1) * dt
        if end - start >= 0.08:
            notes.append((start, end, int(pitch[i]), 80))
        i = j + 1

    # Kurze Lücken (Konsonanten) und gleiche Töne direkt nacheinander verbinden
    merged: list[tuple[float, float, int, int]] = []
    for n in notes:
        if merged and merged[-1][2] == n[2] and n[0] - merged[-1][1] < 0.06:
            merged[-1] = (merged[-1][0], n[1], n[2], n[3])
        else:
            merged.append(n)
    return merged


def beat_times(audio: Path) -> np.ndarray:
    import librosa

    y, sr = librosa.load(str(audio), sr=22050, mono=True)
    _, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    return np.asarray(beats, dtype=float)


def to_beats(t: float, beats: np.ndarray) -> float:
    """Sekunden -> Schläge, linear zwischen den gefundenen Schlägen, außen fortgeschrieben."""
    if len(beats) < 2:
        return t * 2.0
    if t <= beats[0]:
        return (t - beats[0]) / (beats[1] - beats[0])
    if t >= beats[-1]:
        return (len(beats) - 1) + (t - beats[-1]) / (beats[-1] - beats[-2])
    k = int(np.searchsorted(beats, t)) - 1
    return k + (t - beats[k]) / (beats[k + 1] - beats[k])


def write_midi(path: Path, tracks: dict[str, list], beats: np.ndarray, meter: int, skip: int):
    import mido

    ppq = 480
    bpm = 60.0 / float(np.median(np.diff(beats))) if len(beats) > 1 else 120.0
    mid = mido.MidiFile(type=1, ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=meter, denominator=4, time=0))
    mid.tracks.append(meta)

    # Takt 1 beginnt beim ersten gefundenen Schlag (plus Auftakt-Korrektur). Was davor klingt,
    # rutscht in einen Vorspann-Takt, damit nichts auf negative Zeiten fällt.
    events_all = [n for notes in tracks.values() for n in notes]
    first = min((to_beats(n[0], beats) for n in events_all), default=0.0) - skip
    offset = -skip + (meter * np.ceil(-first / meter) if first < 0 else 0)

    for channel, (name, notes) in enumerate(tracks.items()):
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=name, time=0))
        ev = []
        for s, e, m, v in notes:
            bs, be = to_beats(s, beats) + offset, to_beats(e, beats) + offset
            ts, te = round(bs * ppq), max(round(be * ppq), round(bs * ppq) + ppq // 8)
            ev.append((ts, 1, mido.Message("note_on", note=m, velocity=max(1, min(127, v)), channel=channel)))
            ev.append((te, 0, mido.Message("note_off", note=m, velocity=0, channel=channel)))
        ev.sort(key=lambda x: (x[0], x[1]))
        now = 0
        for t, _, msg in ev:
            msg.time = t - now
            now = t
            tr.append(msg)
        mid.tracks.append(tr)
    mid.save(str(path))
    return bpm


def warmup():
    import torchcrepe  # noqa: F401  (Gewichte liegen im Paket)
    from demucs.pretrained import get_model
    from piano_transcription_inference import PianoTranscription

    get_model("htdemucs_6s")
    # Das Paket lädt sein Modell per wget, das auf macOS meist fehlt: dann selbst holen
    ckpt = Path.home() / "piano_transcription_inference_data" / "note_F1=0.9677_pedal_F1=0.9186.pth"
    if not ckpt.exists() or ckpt.stat().st_size < 1e8:
        import urllib.request

        ckpt.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(
            "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1",
            ckpt,
        )
    PianoTranscription(device="cpu")
    print("Modelle geladen.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="?", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("."))
    ap.add_argument("--meter", type=int, default=4)
    ap.add_argument("--skip-beats", type=int, default=0)
    ap.add_argument("--no-melody", action="store_true")
    ap.add_argument("--warmup", action="store_true")
    a = ap.parse_args()
    if a.warmup:
        return warmup()
    if not a.audio:
        ap.error("Audiodatei fehlt")

    a.out.mkdir(parents=True, exist_ok=True)
    work = a.out / f".{a.audio.stem}-stems"
    print("1/4 Trennen (Demucs) …", file=sys.stderr)
    stems = separate(a.audio, work)
    print("2/4 Klavier -> Noten …", file=sys.stderr)
    piano = piano_notes(stems["piano"])
    melody = []
    if not a.no_melody:
        print("3/4 Gesang -> Melodie …", file=sys.stderr)
        melody = melody_notes(stems["vocals"])
    print("4/4 Beats und MIDI …", file=sys.stderr)
    beats = beat_times(a.audio)
    tracks = {"Melodie": melody, "Klavier": piano} if melody else {"Klavier": piano}
    out = a.out / f"{a.audio.stem}.mid"
    bpm = write_midi(out, tracks, beats, a.meter, a.skip_beats)
    print(f"{out}  ({bpm:.0f} bpm, Klavier {len(piano)} Töne, Melodie {len(melody)} Töne)")


if __name__ == "__main__":
    main()
