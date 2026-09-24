const ERROR_TEXT: Record<string, string> = {
  'Must follow suit if possible': 'Du musst die Farbe bedienen.',
  'Not your turn': 'Du bist nicht dran.',
  'Cannot klopf twice in a row': 'Du kannst nicht zweimal hintereinander klopfen.',
  'Game already started': 'Das Spiel läuft schon. Beitreten geht erst nach Spielende über eine Revanche.',
  'Too many players': 'Der Raum ist voll.',
  'Room not found': 'Diesen Raum gibt es nicht mehr.',
  'Name must be 1 to 20 characters': 'Der Name muss 1 bis 20 Zeichen lang sein.',
  'Player is not active in this round': 'Du bist in dieser Runde ausgestiegen.',
  'Klopf level may not exceed own lives': 'Du kannst nicht höher klopfen, als du Leben hast.',
};

export function errorText(error: string): string {
  return ERROR_TEXT[error] ?? error;
}
