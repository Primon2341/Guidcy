import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('active profile code exposes Follow without any connection UI or RPC callers',()=>{
 const source=read('assets/js/community.js');
 assert.doesNotMatch(source,/community_connection|community_network|connectionButton|data-action="connections?"|function connect\(/);
 assert.match(source,/community_follows/);assert.match(source,/data-direction="followers"/);assert.match(source,/data-direction="following"/);
 assert.match(source,/function refreshIdentity\(/,'photo updates still refresh the profile identity');
});
test('connection retirement preserves data and stops graph queries in public profiles',()=>{
 const sql=read('supabase/migrations/20261110033542_retire_profile_connections.sql');
 assert.match(sql,/drop function if exists public\.community_connection\(uuid,text\)/);
 assert.match(sql,/drop function if exists public\.community_network\(uuid,boolean,uuid\)/);
 assert.match(sql,/revoke all privileges on table public\.community_connections from public,anon,authenticated/);
 assert.doesNotMatch(sql,/drop table|delete from|truncate|cascade/i);
 const profile=sql.slice(sql.indexOf('create or replace function'),sql.indexOf('$$;'));
 assert.doesNotMatch(profile,/community_connections|connection_status|connection_requests/);
 assert.match(profile,/community_people/);assert.match(profile,/company_experience/);assert.match(profile,/consultant_id/);
});
