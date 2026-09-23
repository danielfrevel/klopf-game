# SQLite-Snapshot je Raum

Der Server speichert jeden Raum als JSON-Blob in `bun:sqlite`, ohne normalisiertes Schema und ohne DB-Server. Es läuft ein Prozess mit einem Volume, und ein Snapshot nach jeder Aktion reicht. Beim Laden baut der Server die Timer aus `phaseEndsAt` neu auf. Abgelehnt: JSON-Datei (kein atomarer Write, keine Purge-Abfrage) und Postgres (Betriebsaufwand).
