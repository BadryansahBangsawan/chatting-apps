-- Rooms + membership + room-scoped messages
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_private INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  member_token TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(room_id, member_name),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

ALTER TABLE messages ADD COLUMN room_id INTEGER;

INSERT OR IGNORE INTO rooms (name, is_private, password_hash, invite_code, owner_name, created_at, last_active_at)
VALUES ('Lobby', 0, NULL, 'LOBBY000', 'system', datetime('now'), datetime('now'));

UPDATE messages
SET room_id = (SELECT id FROM rooms WHERE name = 'Lobby' LIMIT 1)
WHERE room_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms(last_active_at);
