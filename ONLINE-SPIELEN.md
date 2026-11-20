# 🌍 Online spielen mit GitHub Codespaces

So spielen du und deine Freunde gemeinsam übers Internet – kostenlos über GitHub.
Deine Freunde brauchen **kein** GitHub-Konto, nur den Link.

## Casino starten (vor jedem Spieleabend)

1. Öffne **https://github.com/oeodl/SeriousCasino** (angemeldet bei GitHub).
2. Grüner Knopf **„Code“** → Reiter **„Codespaces“** → **„Create codespace on main“**.
   *(Ab dem zweiten Mal: dort deinen vorhandenen Codespace anklicken statt einen neuen anzulegen – sonst sind die Spielstände weg!)*
3. Warten, bis sich der Editor im Browser öffnet (beim ersten Mal 1–2 Minuten). Das Casino startet von selbst.
4. Unten auf den Reiter **„Ports“** klicken. Bei **Port 3000 (Casino)**:
   - In der Spalte **„Visibility“** muss **„Public“** stehen. Falls dort „Private“ steht: Rechtsklick → **Port Visibility → Public**.
   - Mit dem 🌐-Symbol (bzw. Rechtsklick → **Copy Local Address**) den Link kopieren. Er sieht aus wie `https://…-3000.app.github.dev`.
5. Den Link an deine Freunde schicken. Jeder legt ein Profil **mit Passwort** an – fertig!

## Beenden

- Auf **https://github.com/codespaces** beim Codespace auf **„…“ → „Stop codespace“** klicken.
- Spielt niemand mehr, stoppt sich der Codespace nach einer Weile auch von selbst (Standard: 30 Minuten ohne Aktivität im Editor). Das kannst du unter **github.com → Settings → Codespaces → Default idle timeout** auf bis zu 240 Minuten erhöhen.

## Gut zu wissen

- **Kostenlos:** GitHub schenkt ca. **60 Stunden pro Monat** (bei der kleinen 2-Kern-Maschine). Unter github.com → Settings → Billing siehst du, wie viel verbraucht ist. Bei 0 € Ausgabenlimit (Standard) kann nichts kosten.
- **Spielstände** liegen im Codespace (Datei `data/db.json`) und bleiben erhalten, solange du denselben Codespace wieder startest. Ein **neuer** Codespace fängt bei null an. Codespaces, die 30 Tage nicht benutzt werden, löscht GitHub automatisch.
- **Passwörter sind Pflicht** im Online-Modus. Nach 8 falschen Versuchen ist die Anmeldung 10 Minuten gesperrt.
- Der Link funktioniert nur, solange der Codespace läuft.

## Falls kein Link erscheint

Im Codespace unten im **Terminal** eingeben:

```
npm run online
```

und dann bei „Ports“ wie oben den Link holen.
