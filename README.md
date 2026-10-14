# PRISMA

Ein Neon-Survival-Arcade-Spiel für den Browser. Du bist ein Prisma im Dunkel: Sammle Photonen, brich das Licht in Waffen und überstehe 15 Minuten. Dann erwacht der Kern der Finsternis. Besiegst du ihn, kehrt das Licht zurück und du hast gewonnen.

Reines HTML5-Canvas und Web Audio, keine Abhängigkeiten, kein Build-Schritt.

## Spielen

**Live:** https://prisma-game.vercel.app

Lokal: `index.html` im Browser öffnen, das reicht. Wer lieber einen lokalen Server nutzt:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Gehostet wird es auf Vercel als statische Seite, ohne Build-Schritt und ohne Konfiguration.

## Steuerung

| Aktion | Tastatur | Touch | Gamepad |
| --- | --- | --- | --- |
| Bewegen | `W` `A` `S` `D` / Pfeiltasten | irgendwo ziehen (schwebender Stick) | linker Stick / Steuerkreuz |
| Sprint (unverwundbar, verletzt Gegner) | `Leertaste` / `Shift` | Sprint-Knopf unten rechts | `A` / `B` / `RB` |
| Karte wählen | `1`–`4`, `R` neu würfeln | antippen | Steuerkreuz + `A` |
| Pause | `Esc` / `P` | Pause-Knopf | `Start` |
| Ton an/aus | `M` | Schalter im Menü | – |

Waffen feuern automatisch. Du entscheidest, wohin du dich bewegst und was du beim Level-up wählst.

## Ablauf eines Laufs

| Zeit | Ereignis |
| --- | --- |
| 0:00 | Start mit dem Photonenstrahl, die ersten Schatten kommen |
| 3:00 · 6:00 · 9:00 · 12:00 | Boss „Finsternis I–IV“, jeder stärker als der vorige. Jeder besiegte Boss öffnet die nächste Welt. |
| 15:00 | Der **Kern der Finsternis** erwacht: End-Boss mit drei Phasen |
| Kern besiegt | Sieg: alle Schatten lösen sich in Licht auf, +150 Splitter Siegesbonus |

Die Zeitleiste unter der Uhr zeigt, wie weit es noch bis zum Kern ist. Nach einer Niederlage verrät der Endbildschirm, wie viel gefehlt hat.

## Welten

Jeder besiegte Boss wechselt die Farbwelt und schickt einen neuen Gegnertyp ins Feld.

| Welt | Neuer Gegner |
| --- | --- |
| 1 · Dämmerung | – |
| 2 · Glutfeld | **Zünder**: zünden in deiner Nähe und explodieren. Abgeschossene Zünder reißen andere Schatten mit. |
| 3 · Tiefsee | **Phantom**: verblasst und taucht direkt neben dir wieder auf (das Ziel wird kurz markiert) |
| 4 · Giftgarten | **Brutstock**: zäh und langsam, erzeugt ständig Nachwuchs |
| 5 · Leere | **Lanzer**: zielt kurz und stürmt dann in gerader Linie auf dich zu |

## Waffen-Entwicklungen

Bringst du eine Waffe auf Stufe V und besitzt das passende Modul, erscheint beim nächsten Level-up garantiert die Entwicklungskarte. Die Waffenkarten zeigen schon vorher, wohin sie sich entwickeln.

| Waffe | + Modul | Entwicklung |
| --- | --- | --- |
| Photonenstrahl | Fokuslinse | **Sonnenlanze**: schwere Lichtlanzen, die alles durchbohren |
| Linsenkranz | Gravitation | **Ereignishorizont**: zwei gegenläufige Linsenkränze |
| Supernova | Streuung | **Hypernova**: doppelte Schockwelle mit riesigem Radius |
| Kettenblitz | Taktgeber | **Gewittersturm**: drei Blitze, die je zwölfmal springen |
| Spektrallaser | Brechung | **Prismenfächer**: ein Fächer aus fünf Spektralstrahlen |

## Was drinsteckt

- **5 Waffen**, je 5 Stufen: Photonenstrahl, Linsenkranz, Supernova, Kettenblitz, Spektrallaser
- **10 Module** wie Fokuslinse, Taktgeber, Gravitation oder Brechung (+1 Projektil für alles)
- **Level-ups mit Kartenwahl**: drei Karten, bis zu vier Waffen und fünf Module pro Lauf
- **10 Gegnertypen** plus Elite-Varianten, Schwarm-Ereignisse („Umzingelt“), vier Bosse und der End-Boss mit Feuerringen, Spiralfeuer, Beschwörungen und Sturmangriffen
- **Combo-System**: schnelle Kills treiben den Multiplikator. Jede Combo-Stufe löst eine Schockwelle aus. Ein Treffer halbiert die Combo.
- **Werkstatt**: Splitter aus jedem Lauf schalten 12 dauerhafte Verbesserungen frei (z. B. Phönix, Weitsicht, Zweitlinse)
- **5 Waffen-Entwicklungen** und **5 Welten** mit eigenen Farben und Gegnern (siehe oben)
- **21 Erfolge** mit Splitter-Belohnungen, darunter „Kernschmelze“: den Kern in unter 60 Sekunden besiegen
- **Photonen nach Energie**: Rot (wenig) → Grün → Violett (viel). Kürzere Wellenlänge, mehr Erfahrung, wie beim echten Licht.
- Synthetisierte Soundeffekte und eine Musik, die mit der Spannung des Laufs dichter wird
- Läuft auf Desktop, Handy (Touch) und mit Gamepad. Fortschritt wird im Browser gespeichert (`localStorage`).

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Aufbau von HUD, Menüs und Overlays |
| `style.css` | Gestaltung (Neon-Look, responsive) |
| `game.js` | Spiellogik, Rendering, Audio, Eingabe, Speicherstand |
