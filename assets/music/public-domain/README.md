# Gemeinfreie Stücke

Beide Werke sind gemeinfrei (Komponisten seit über 70 Jahren tot). Die Satzdateien stammen vom
Mutopia Project und wurden von den Setzern ausdrücklich in die Public Domain gegeben.

| Datei | Werk | Quelle |
| --- | --- | --- |
| `gymnopedie_1.mid` / `.ly` | Erik Satie, Gymnopédie No. 1 (1888) | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37 (Setzer: Evin Robertson) |
| `debussy_Ste_Bergamesq_Clair.mid` / `.ly` | Claude Debussy, Suite bergamasque: Clair de Lune (L. 75) | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1778 (Setzer: Keith OHara) |

`gymnopedie_1.unfolded.mid` ist aus der `.ly` neu erzeugt (LilyPond 2.24, `\unfoldRepeats`): Die
Mutopia-MIDI spielt die Wiederholung nicht aus und hängt beide Schlüsse aneinander.

Für die Startseite macht `uv run tools/midi-to-ambient.py` daraus `apps/website/public/music/*.json`
(Tempo je Takt nach den Spielanweisungen, Dynamik für Clair de Lune, das in der Datei keine hat).

Geprüft mit `parseMidi` + `pieceFromMidi` (packages/core): Gymnopédie 3/4, D-Dur, 47 Takte;
Clair de Lune 9/8, Des-Dur, 72 Takte; je eine Spur pro Hand.

Nur eigene Wiedergabe (Synth/Samples) nutzen, keine fremden Aufnahmen: Aufnahmen haben eigene
Leistungsschutzrechte, auch bei gemeinfreien Werken.
