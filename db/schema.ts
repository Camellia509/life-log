import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const users=sqliteTable('users',{id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),password:text('password').notNull(),salt:text('salt').notNull(),settings:text('settings').notNull().default('{}'),revision:integer('revision').notNull().default(1)});
export const sessions=sqliteTable('sessions',{
  token:text('token').primaryKey(),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  expires:integer('expires').notNull(),
  // Kept nullable at the SQLite level so the additive migration can safely
  // backfill sessions created by stage 1 without rebuilding the table.
  id:text('id'),
  deviceIdHash:text('device_id_hash').notNull().default(''),
  deviceLabel:text('device_label').notNull().default('旧设备'),
  userAgentHash:text('user_agent_hash').notNull().default(''),
  createdAt:integer('created_at').notNull().default(0),
  lastUsedAt:integer('last_used_at').notNull().default(0),
  revokedAt:integer('revoked_at'),
},t=>[
  uniqueIndex('sessions_public_id').on(t.id),
  index('sessions_user_active').on(t.userId,t.revokedAt,t.expires),
  index('sessions_device').on(t.userId,t.deviceIdHash),
]);
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),date:text('date').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),updated:text('updated').notNull()},t=>[index('records_date').on(t.date),uniqueIndex('one_daily_record').on(t.kind,t.date).where(sql.raw("kind IN ('sleep','meal')"))]);
export const habits=sqliteTable('habits',{id:text('id').primaryKey(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1)});
export const attempts=sqliteTable('attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),until:integer('until').notNull()});
