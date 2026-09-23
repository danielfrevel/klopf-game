# Klopf

Deutsch in UI und Doku, Englisch im Code.

## Language

**Spiel**:
Eine Partie. Endet, wenn nur noch ein Spieler Leben hat. Code `game`.

**Runde**:
Ein Austeilen mit 4 Karten je Spieler und 4 Stichen. Endet mit Lebensverlust der Verlierer. Code `round`.

**Stich**:
Eine Karte je aktivem Spieler, höchste Karte der Vorhand-Farbe gewinnt. Code `trick`.

**Vorhand-Farbe**:
Farbe der ersten Karte im Stich. Andere Farben können nicht gewinnen. Code `leadSuit`.
_Avoid_: Trumpf, `trumpSuit`

**Ausspieler**:
Spieler, der die erste Karte eines Stichs oder einer Runde legt. Code `leader`.

**Leben**:
Zähler je Spieler, Start 7. Code `lives`.

**Ausgeschieden**:
Spieler mit 0 Leben. Schaut bis Spielende zu. Code `!isAlive`.
_Avoid_: tot, raus

**Klopf / Klopfen**:
Einsatzerhöhung um eine Stufe, jederzeit in `dealing` oder `playing`. Code `klopf`.

**Klopf-Stufe**:
Anzahl der Klopfs in dieser Runde. Bestimmt Strafen. Code `level`.

**Konter**:
Klopf eines anderen Spielers auf einen bestehenden Klopf. Kein eigener Code-Begriff, ist ein Klopf mit `level > 1`.

**Mitgehen**:
Antwort auf einen Klopf, Spieler bleibt in der Runde und trägt die erhöhte Strafe. Code `mitgehen`.
_Avoid_: annehmen, akzeptieren

**Aussteigen**:
Antwort auf einen Klopf, Spieler zahlt sofort Stufe Leben und ist für den Rest der Runde raus. Code `fold`/`folded`.
_Avoid_: ablehnen, passen, nicht mitgehen

**Ausgestiegen**:
Zustand eines Spielers für den Rest der Runde nach dem Aussteigen. Code `folded`.

**Aktiv**:
Spieler, der lebt und in dieser Runde nicht ausgestiegen ist. Nur aktive Spieler legen Karten und antworten auf Klopfs. Code `active`.

**Auto-Klopf**:
Pflichtklopf zu Rundenbeginn durch den ersten Spieler mit 1 Leben. Code `autoKlopf`.

**Mitgeh-Pflicht**:
Spieler mit 1 Leben kann nicht aussteigen. Code `mustMitgehen`.

**Blind auf 3**:
Klopf auf Stufe 3 vor dem Aufdecken der eigenen Karten. Code `blindDrei`.

**Aufdecken**:
Spieler sieht seine Karten an, beendet für ihn die Blind-Option. Code `reveal`/`revealed`.

**Austeilphase**:
Zeit zwischen Austeilen und erstem Stich für Aufdecken, Blind auf 3, Einigung. Code `dealing`.
_Avoid_: Dealing (in Doku), Vorphase

**Einigung**:
Beidseitig zugestimmte Neuverteilung bei genau zwei aktiven Spielern in der Austeilphase. Code `redeal`.
_Avoid_: Neuverteilung, Redeal (in UI)

**Einsatz**:
Geldwert je Leben-Differenz, vom Host in der Lobby gesetzt. Code `stakes`.

**Perfektes Spiel**:
Sieg mit 7 Leben, verdoppelt den Gewinn. Code `perfectWin`.

**Raum**:
Container für Spieler und ein Spiel, adressiert über sechsstelligen Code in der URL. Code `room`.

**Host**:
Der erste verbundene Spieler in Sitzreihenfolge. Darf Spiel starten, Einsatz setzen, Raum schließen und Revanche starten. Code `hostId`.
_Avoid_: Owner, Besitzer, Admin

**Session**:
Raumcode plus geheimes Spieler-Token im Browser, erlaubt Wiedereinstieg. Code `session`, `token`.
_Avoid_: Login, Account

**Revanche**:
Neues Spiel im selben Raum mit denselben Spielern. Code `restartGame`.
