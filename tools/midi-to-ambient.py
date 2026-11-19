# /// script
# requires-python = ">=3.11"
# dependencies = ["mido>=1.3"]
# ///
"""
MIDI -> kompakte Notenliste für den Mini-Player der Startseite (apps/website/public/music/*.json).

Der Player spielt mit dem Klavier der App (smplr), braucht also nur Töne: Beginn, Ton, Dauer,
Anschlag. Notensatz-MIDIs (LilyPond) kennen keine Agogik; deshalb setzt diese Datei je Stück ein
Tempo pro Takt (Faktor auf das Tempo der Datei), so wie die Spielanweisungen im Notentext es
verlangen. Pedal (CC64) verlängert Töne bis zum Loslassen.

Aufruf: uv run tools/midi-to-ambient.py
"""

import json
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "music" / "public-domain"
OUT = ROOT / "apps" / "website" / "public" / "music"

# Takt -> Tempofaktor ab diesem Takt (bis zum nächsten Eintrag)
PIECES = [
    {
        "id": "gymnopedie-1",
        "file": "gymnopedie_1.unfolded.mid",
        "title": "Gymnopédie No. 1",
        "composer": "Erik Satie",
        "year": 1888,
        # „Lent et douloureux“, ruhig schwingend; zum Schluss leicht zurücknehmen
        "tempo": {1: 1.1, 77: 0.95, 78: 0.8},
        # Satz-Dynamik ist da (pp bis p), nur etwas leiser für Hintergrund
        "vel_scale": 0.78,
    },
    {
        "id": "clair-de-lune",
        "file": "debussy_Ste_Bergamesq_Clair.mid",
        "title": "Clair de Lune",
        "composer": "Claude Debussy",
        "year": 1905,
        # Andante très expressif · T. 15 Tempo rubato · T. 27 Un poco mosso · T. 37 En animant ·
        # T. 43 Calmato · T. 51 a Tempo 1º · Schluss morendo
        "tempo": {1: 0.82, 15: 0.86, 27: 1.0, 37: 1.15, 41: 1.05, 43: 0.9, 51: 0.82, 66: 0.78, 70: 0.7, 71: 0.62, 72: 0.55},
        # Die Datei hat keine Dynamik (alles 90): Anschlag je Takt nach dem Notentext, pp bis f
        "dynamics": {1: 42, 15: 48, 19: 55, 25: 48, 27: 46, 31: 56, 33: 64, 37: 76, 41: 82, 42: 66, 43: 48, 51: 42, 66: 38, 70: 32},
    },
]


def convert(p: dict) -> dict:
    mid = mido.MidiFile(SRC / p["file"])
    ppq = mid.ticks_per_beat
    us_per_q = 1_000_000
    num, den = 4, 4
    events = []  # (tick, kind, channel, a, b)
    for track in mid.tracks:
        tick = 0
        for msg in track:
            tick += msg.time
            if msg.type == "set_tempo" and tick == 0:
                us_per_q = msg.tempo
            elif msg.type == "time_signature" and tick == 0:
                num, den = msg.numerator, msg.denominator
            elif msg.type in ("note_on", "note_off"):
                on = msg.type == "note_on" and msg.velocity > 0
                events.append((tick, 1 if on else 0, msg.channel, msg.note, msg.velocity))
            elif msg.type == "control_change" and msg.control == 64:
                events.append((tick, 2, msg.channel, msg.value, 0))

    bar_ticks = round(ppq * num * 4 / den)
    factors = p["tempo"]

    def factor(bar: int) -> float:
        f = 1.0
        for b in sorted(factors):
            if b <= bar:
                f = factors[b]
        return f

    last_tick = max(e[0] for e in events)
    bar_start_sec = [0.0]
    sec_per_tick = us_per_q / 1e6 / ppq
    for bar in range(1, last_tick // bar_ticks + 3):
        bar_start_sec.append(bar_start_sec[-1] + bar_ticks * sec_per_tick / factor(bar))

    def seconds(tick: int) -> float:
        i = tick // bar_ticks
        return bar_start_sec[i] + (tick - i * bar_ticks) * sec_per_tick / factor(i + 1)

    # Töne zusammensetzen; Pedal hält losgelassene Töne bis zum Pedalwechsel
    events.sort(key=lambda e: (e[0], e[1]))
    sounding: dict[tuple[int, int], tuple[int, int]] = {}
    held: dict[int, list[tuple[int, int, int]]] = {}
    pedal: dict[int, bool] = {}
    notes = []

    def finish(ch: int, note: int, start: int, vel: int, end: int):
        notes.append((start, note, end, vel))

    for tick, kind, ch, a, b in events:
        if kind == 2:
            down = a >= 64
            if pedal.get(ch) and not down:
                for note, start, vel in held.pop(ch, []):
                    finish(ch, note, start, vel, tick)
            pedal[ch] = down
        elif kind == 1:
            key = (ch, a)
            if key in sounding:
                start, vel = sounding.pop(key)
                finish(ch, a, start, vel, tick)
            for i, (note, start, vel) in enumerate(held.get(ch, [])):
                if note == a:
                    held[ch].pop(i)
                    finish(ch, note, start, vel, tick)
                    break
            sounding[key] = (tick, b)
        else:
            key = (ch, a)
            if key not in sounding:
                continue
            start, vel = sounding.pop(key)
            if pedal.get(ch):
                held.setdefault(ch, []).append((a, start, vel))
            else:
                finish(ch, a, start, vel, tick)
    for (ch, note), (start, vel) in sounding.items():
        finish(ch, note, start, vel, last_tick)
    for ch, lst in held.items():
        for note, start, vel in lst:
            finish(ch, note, start, vel, last_tick)

    notes.sort()

    # Anschlag: Dynamik je Takt (falls gesetzt) oder skaliert; der oberste Ton eines Akkords
    # (gleicher Anschlagzeitpunkt) trägt die Melodie und klingt etwas heraus
    dyn = p.get("dynamics")
    scale = p.get("vel_scale", 1.0)

    def bar_value(table: dict, bar: int) -> int:
        v = table[min(table)]
        for b in sorted(table):
            if b <= bar:
                v = table[b]
        return v

    top_at: dict[int, int] = {}
    for start, note, _, _ in notes:
        top_at[start] = max(top_at.get(start, 0), note)
    shaped = []
    for start, note, end, vel in notes:
        v = bar_value(dyn, start // bar_ticks + 1) if dyn else vel * scale
        if note == top_at[start] and note >= 60:
            v += 8
        shaped.append((start, note, end, max(1, min(127, round(v)))))
    notes = shaped

    flat = []
    for start, note, end, vel in notes:
        t0, t1 = seconds(start), seconds(end)
        flat += [round(t0 * 1000), note, max(40, round((t1 - t0) * 1000)), vel]
    duration = max(flat[i] + flat[i + 2] for i in range(0, len(flat), 4)) / 1000
    return {
        "v": 1,
        "id": p["id"],
        "title": p["title"],
        "composer": p["composer"],
        "year": p["year"],
        "duration": round(duration + 2.5, 1),
        # je Ton vier Zahlen: Beginn ms, MIDI-Ton, Dauer ms, Anschlag 1–127
        "notes": flat,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in PIECES:
        data = convert(p)
        path = OUT / f"{p['id']}.json"
        path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        n = len(data["notes"]) // 4
        vels = data["notes"][3::4]
        print(f"{path.relative_to(ROOT)}: {n} Töne, {data['duration']:.0f} s, Anschlag {min(vels)}–{max(vels)}, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
