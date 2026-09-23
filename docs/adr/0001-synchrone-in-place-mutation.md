# Synchrone In-Place-Mutation der Spiellogik

Die Spiellogik mutiert `GameData` synchron in-place, ohne Locking, Event-Sourcing oder Immutable-State. Bun läuft single-threaded und Elysia ruft die Handler synchron auf, also gilt: eine Nachricht, eine Mutation, ein Save. Deshalb darf kein `await` in Handlern oder Spiellogik stehen.
