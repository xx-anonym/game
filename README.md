# PRISMA

Ein Neon-Survival-Arcade-Spiel für den Browser. Du bist ein Prisma im Dunkel: Sammle Photonen, brich das Licht in Waffen und halte die Schatten so lange auf, wie du kannst.

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

## Was drinsteckt

- **5 Waffen**, je 5 Stufen: Photonenstrahl, Linsenkranz, Supernova, Kettenblitz, Spektrallaser
- **10 Module** wie Fokuslinse, Taktgeber, Gravitation oder Brechung (+1 Projektil für alles)
- **Level-ups mit Kartenwahl**: drei Karten, bis zu vier Waffen und fünf Module pro Lauf
- **6 Gegnertypen** plus Elite-Varianten, Schwarm-Ereignisse („Umzingelt“) und alle 3 Minuten ein Boss (Finsternis) mit Feuerkreisen, Beschwörungen und Sturmangriffen
- **Combo-System**: schnelle Kills treiben den Multiplikator. Jede Combo-Stufe löst eine Schockwelle aus. Ein Treffer halbiert die Combo.
- **Werkstatt**: Splitter aus jedem Lauf schalten 12 dauerhafte Verbesserungen frei (z. B. Phönix, Weitsicht, Zweitlinse)
- **15 Erfolge** mit Splitter-Belohnungen
- **Photonen nach Energie**: Rot (wenig) → Grün → Violett (viel). Kürzere Wellenlänge, mehr Erfahrung, wie beim echten Licht.
- Synthetisierte Soundeffekte und eine Musik, die mit der Spannung des Laufs dichter wird
- Läuft auf Desktop, Handy (Touch) und mit Gamepad. Fortschritt wird im Browser gespeichert (`localStorage`).

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Aufbau von HUD, Menüs und Overlays |
| `style.css` | Gestaltung (Neon-Look, responsive) |
| `game.js` | Spiellogik, Rendering, Audio, Eingabe, Speicherstand |
