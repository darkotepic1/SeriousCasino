# 🎰 Spaß-Casino

Ein privates Casino **nur mit Spielgeld** für dich und deine Freunde.
Läuft ausschließlich auf deinem eigenen PC – kein echtes Geld, keine Zahlungen, kein Internet nötig, nichts wird veröffentlicht.

---

## Starten

1. Doppelklick auf **`start.bat`**
2. Ein schwarzes Fenster öffnet sich und kurz danach dein Browser mit dem Casino.
3. Beim ersten Mal einen Namen eingeben → du bekommst **10.000 Chips**.

**Wichtig:** Das schwarze Fenster offen lassen, solange du spielst.
**Beenden:** Einfach das schwarze Fenster schließen.

Falls sich der Browser nicht von selbst öffnet: Diese Adresse in den Browser eintippen:
**http://127.0.0.1:3000**

## Installation

Nichts zu tun. Alles Nötige liegt schon im Ordner (auch eine eigene Node.js-Version im Unterordner `node`).
Du kannst den ganzen Ordner an einen beliebigen Ort verschieben (z. B. auf den Desktop) – `start.bat` funktioniert überall.

> Falls der Unterordner `node` fehlt: Node.js (LTS) von https://nodejs.org installieren. `start.bat` nutzt dann automatisch diese Version.
> Falls der Ordner `node_modules` fehlt, lädt `start.bat` ihn beim ersten Start einmalig aus dem Internet nach.

### Von GitHub herunterladen (für Freunde)

Im GitHub-Repository fehlen absichtlich die große Node.js-Version, `node_modules` und die Spielstände.

1. **Node.js (LTS)** von https://nodejs.org installieren (einmalig).
2. Auf GitHub: grüner Knopf **„Code“** → **„Download ZIP“**, ZIP entpacken.
3. Im entpackten Ordner Doppelklick auf **`start.bat`**. Beim ersten Start werden die Bausteine einmalig aus dem Internet geladen, danach läuft alles offline.

Jeder, der es so herunterlädt, hat sein **eigenes** Casino mit eigenen Profilen.

## Guthaben & Boni

| Was | Wie viel | Wann |
|---|---|---|
| Startguthaben | 10.000 Chips | pro neuem Profil |
| Tagesbonus | +1.000 Chips | 1× pro Kalendertag (Knopf oben im Banner) |
| Nachfüllen | +5.000 Chips | wenn du unter 100 Chips hast, max. 1× pro Stunde |

Jedes Profil (nur ein Name, kein Passwort) hat sein eigenes Guthaben. Profil wechseln: oben rechts auf den Namen/Buchstaben klicken.

## 🛠️ Admin-Bereich (Chips verteilen)

Unter **Einstellungen → Admin-Bereich öffnen** kannst du jedem Spieler Chips **geben (+)**, **abziehen (−)** oder das Guthaben **genau setzen (=)**. Außerdem: Profil zurücksetzen, vergessenes Passwort neu vergeben, Spieler löschen. Änderungen erscheinen im Verlauf des Spielers als „Admin“.

Der Bereich ist mit einem eigenen **Admin-Passwort** geschützt (mind. 6 Zeichen):
- **Am PC:** Beim ersten Öffnen des Admin-Bereichs direkt am PC legst du es fest – oder per Doppelklick auf **`admin-passwort.bat`** (auch zum Ändern).
- **Im Codespace (online):** unten im Terminal `npm run admin` eingeben. Über die Webseite geht das online absichtlich nicht.

## Guthaben zurücksetzen

**Ein Profil zurücksetzen:** Einstellungen → **„Profil zurücksetzen“** → bestätigen.
Das Profil hat dann wieder 10.000 Chips, Statistik und Verlauf sind gelöscht.

**Alles komplett löschen** (alle Profile): Casino beenden (schwarzes Fenster schließen) und die Datei `data\db.json` löschen. Beim nächsten Start ist alles wie neu.

## Spiele

| Spiel | Kurz erklärt | Auszahlungsquote* |
|---|---|---|
| 🎰 Slots | 5 Walzen, 10 Gewinnlinien, mind. 3 gleiche von links | ≈ 96 % |
| 🃏 Blackjack | 6 Decks, Dealer zieht bis 17, Blackjack zahlt 3:2, Verdoppeln, Teilen | ≈ 99 % |
| 🎡 Roulette | Europäisch (eine Null): Zahlen, Farben, Gerade/Ungerade, Dutzende, Kolonnen | 97,3 % |
| ♠️ Video Poker | Jacks or Better, 9/6-Tabelle | ≈ 99,5 % |
| 🚀 Crash | Multiplikator steigt – rechtzeitig auscashen (auch automatisch) | ≈ 99 % |
| 💣 Mines | 5×5-Feld, 1–24 Minen, jederzeit auscashen | 99 % |
| 🎯 Plinko | 8/12/16 Reihen, Risiko niedrig/mittel/hoch | ≈ 99 % |
| 🎲 Würfel | Über/unter, Gewinnchance 1–95 % frei wählbar | 99 % |
| 🔢 Keno | 1–10 Zahlen aus 40 tippen, 10 werden gezogen | ≈ 97 % |
| 🎴 Baccarat | Spieler, Bank oder Unentschieden – wer kommt näher an 9 | ≈ 98,9 % (Bank) |
| ↕️ Hi-Lo | Nächste Karte höher oder niedriger, Serie aufbauen, auscashen | 99 % pro Tipp |
| 🍀 Glücksrad | 30 Felder, Risiko niedrig/mittel/hoch | 99 % |
| 🗼 Turm | 8 Stockwerke, Fallen meiden, 4 Schwierigkeitsstufen | 99 % |
| 🎟️ Rubbellos | 9 Felder freirubbeln, 3 gleiche gewinnen bis 500× | 95 % |
| 🪙 Münzwurf | Kopf oder Zahl, jeder Treffer ×1,98 | 99 % pro Wurf |
| 📈 Limbo | Ziel-Multiplikator wählen, Ergebnis muss drüber liegen | 99 % |
| 🎲 Craps | Pass Line, Don't Pass, Field, Any 7, Any Craps | 98,6 % (Pass) |
| 🀄 Sic Bo | 3 Würfel: Klein/Groß, Summen, Einzelzahlen, Zweier, Dreier | 97,2 % (Klein/Groß) |
| 🂠 Drei-Karten-Poker | Ante/Spielen gegen den Dealer + Paar-Plus | ≈ 97–98 % |
| ⚔️ Kartenkrieg | Höhere Karte gewinnt, bei Gleichstand Krieg oder Aufgeben | ≈ 97 % |
| 🐕 Red Dog | Dritte Karte muss zwischen die ersten beiden fallen | ≈ 97 % |
| 🐉 Drache & Tiger | Eine Karte je Seite, höhere gewinnt | 96,3 % |
| 🏇 Pferderennen | 6 Pferde, Quoten nach Siegchance | ≈ 95 % |
| 🔵 Schnell-Bingo | 40 von 75 Kugeln, Gewinn nach fertigen Linien | ≈ 95 % |
| 🥤 Hütchenspiel | 3–5 Becher, finde die Kugel | 99 % |
| ✌️ Schere-Stein-Papier | Gegen das Haus, Sieg 1,97× | 99 % |

\* Langfristiger Durchschnitt wie in echten Casinos – auf Dauer gewinnt also das Haus. 😉
Alle Ergebnisse werden auf dem Server mit einem kryptografischen Zufallsgenerator (`crypto.randomInt`) erzeugt.

**Tastenkürzel:** Leertaste = Drehen/Würfeln/Start · Blackjack: H, S, D, P · Video Poker: 1–5 zum Halten · Hi-Lo: ↑ ↓ →.

## Mit Freunden spielen

**Am selben PC:** Jeder legt sein eigenes Profil an und wechselt oben rechts. Die **Rangliste** zeigt, wer vorne liegt.

**Immer online unter https://oeodl.github.io/SeriousCasino/ (GitHub Pages + Render + Neon, kostenlos):** siehe **[IMMER-ONLINE.md](IMMER-ONLINE.md)** – einmal einrichten, danach läuft es rund um die Uhr, auch wenn dein PC aus ist.

**Übers Internet, nur bei Bedarf (GitHub Codespaces):** siehe **[ONLINE-SPIELEN.md](ONLINE-SPIELEN.md)** – kostenlos, Freunde brauchen nur einen Link. Dort sind Passwörter Pflicht.

**Profil-Passwort:** In den Einstellungen kann jedes Profil ein Passwort bekommen (lokal optional). Mit „Abmelden“ meldest du dich auf dem Gerät ab.

**Mit eigenen Handys/Laptops im selben WLAN (Heimnetz-Modus):**

1. Falls das Casino schon läuft: schwarzes Fenster schließen.
2. Doppelklick auf **`start-heimnetz.bat`** (statt `start.bat`).
3. Beim **ersten Mal** fragt Windows nach der Firewall → Haken bei **„Private Netzwerke“** setzen und **Zugriff zulassen**. (Öffentliche Netzwerke nicht nötig.)
4. Im schwarzen Fenster und in der App unter **Einstellungen** bzw. **Rangliste** steht die Adresse für deine Freunde, z. B. `http://192.168.178.20:3000`.
5. Freunde tippen diese Adresse im Browser ihres Handys/Laptops ein und legen ihr Profil an. Guthaben, Statistik und Rangliste liegen alle bei dir auf dem PC.

Gut zu wissen:
- Alle müssen im **selben WLAN** sein. Wechselt dein PC das WLAN, ändert sich die Adresse – die App zeigt immer die aktuelle an.
- Profile haben **kein Passwort** – unter Freunden im Heimnetz kein Problem, aber jeder könnte jedes Profil wählen.
- Aus dem Internet ist das Casino auch im Heimnetz-Modus **nicht** erreichbar: Der Server nimmt nur Verbindungen von Geräten aus dem lokalen Netz an.
- `start.bat` funktioniert weiter wie bisher: dann nur auf diesem PC.
- Falls die Firewall-Frage versehentlich abgelehnt wurde: Windows-Suche → „Eine App durch die Windows-Firewall zulassen“ → `node.exe` aus dem Ordner `casino\node` für „Privat“ erlauben.

## Häufige Probleme

- **„Port 3000 ist schon belegt“** – Das Casino läuft wahrscheinlich schon in einem anderen schwarzen Fenster. Dieses benutzen oder schließen und neu starten.
- **Seite lädt nicht** – Prüfen, ob das schwarze Fenster noch offen ist.
- **Kein Ton** – Oben auf den Lautsprecher 🔊 klicken (manche Browser spielen Ton erst nach dem ersten Klick ab).

## Für Technik-Interessierte

```
casino/
├─ start.bat            Startskript
├─ node/                mitgelieferte Node.js-Version
├─ server/
│  ├─ index.js          Express-Server (nur 127.0.0.1:3000)
│  ├─ db.js             Speichern in data/db.json
│  ├─ profiles.js       Profile, Guthaben, Bonus, Statistik
│  ├─ util.js           Zufall, Einsatzprüfung, Kartendecks
│  └─ games/            Spiellogik (eine Datei pro Spiel)
├─ public/              Oberfläche (HTML/CSS/JavaScript, ohne Build-Schritt)
└─ data/db.json         alle Profile (wird automatisch angelegt)
```

Manuell starten: `node server/index.js` (ohne `--open` öffnet sich kein Browser).
