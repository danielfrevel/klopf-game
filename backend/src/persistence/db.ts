import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import type { RoomData } from '../game/types.js';
import { RoomSnapshotSchema, fromSnapshot, toSnapshot } from '../game/serialize.js';
import { log } from '../utils/logger.js';

export function openRoomStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  db.run('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');

  const upsert = db.prepare(
    'INSERT INTO rooms (code, data, updated_at) VALUES (?1, ?2, ?3) ' +
    'ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  );
  const selectAll = db.prepare<{ code: string; data: string }, []>('SELECT code, data FROM rooms');
  const remove = db.prepare('DELETE FROM rooms WHERE code = ?1');
  const expired = db.prepare<{ code: string }, [number]>('DELETE FROM rooms WHERE updated_at < ?1 RETURNING code');

  return {
    db,

    saveRoom(room: RoomData, updatedAt = Date.now()): void {
      upsert.run(room.code, JSON.stringify(toSnapshot(room)), updatedAt);
    },

    loadRooms(): RoomData[] {
      const rooms: RoomData[] = [];
      for (const row of selectAll.all()) {
        try {
          const snapshot: unknown = JSON.parse(row.data);
          if (!Value.Check(RoomSnapshotSchema, snapshot)) {
            log.room.warn(`Skipping invalid room snapshot ${row.code}`);
            continue;
          }
          rooms.push(fromSnapshot(snapshot));
        } catch (e) {
          log.room.warn(`Skipping unreadable room snapshot ${row.code}`, { error: String(e) });
        }
      }
      return rooms;
    },

    deleteRoom(code: string): void {
      remove.run(code);
    },

    purgeOlderThan(maxAgeMs: number, now = Date.now()): string[] {
      return expired.all(now - maxAgeMs).map((r) => r.code);
    },
  };
}

export type RoomStore = ReturnType<typeof openRoomStore>;

let store: RoomStore | null = null;

function defaultStore(): RoomStore {
  store ??= openRoomStore(process.env.DB_PATH ?? 'data/klopf.sqlite');
  return store;
}

export function saveRoom(room: RoomData): void {
  defaultStore().saveRoom(room);
}

export function loadRooms(): RoomData[] {
  return defaultStore().loadRooms();
}

export function deleteRoom(code: string): void {
  defaultStore().deleteRoom(code);
}

export function purgeOlderThan(maxAgeMs: number): string[] {
  return defaultStore().purgeOlderThan(maxAgeMs);
}
