
-- Insert some debug records

INSERT INTO users (id, password) VALUES ('pfraze', 'password');
INSERT INTO users (id, password) VALUES ('bob', 'password');
INSERT INTO apps (id) VALUES ('chat.grimwire.com');
INSERT INTO apps (id) VALUES ('webdrive.grimwire.com');

INSERT INTO stations (id, owning_user_id, name, invites, admins, is_public) VALUES ('foobar', 'pfraze', 'Foobar Station', '{"bob","pfraze"}', '{"pfraze"}', 't');
INSERT INTO stations (id, owning_user_id, name, invites, admins, is_public) VALUES ('bobs-palace', 'bob', 'Bob''s Palace', '{"bob"}', '{"bob"}', 'f');

INSERT INTO app_auth_tokens (id, station_id, user_id, app_id) SELECT uuid_generate_v4(), 'foobar', 'pfraze', 'chat.grimwire.com';
INSERT INTO app_auth_tokens (id, station_id, user_id, app_id) SELECT uuid_generate_v4(), 'foobar', 'pfraze', 'webdrive.grimwire.com';
INSERT INTO app_auth_tokens (id, station_id, user_id, app_id) SELECT uuid_generate_v4(), 'foobar', 'bob', 'chat.grimwire.com';
--INSERT INTO user_presences (station_id, user_id, app_id) VALUES ('foobar', 'pfraze', 'chat.grimwire.com');
--INSERT INTO user_presences (station_id, user_id, app_id) VALUES ('foobar', 'pfraze', 'webdrive.grimwire.com');
--INSERT INTO user_presences (station_id, user_id, app_id) VALUES ('foobar', 'bob', 'chat.grimwire.com');


-- Test queries
select * from active_public_stations_list_view;
select * from empty_active_stations_list_view;
select * from user_online_stations_fn('pfraze');
select * from user_online_stations_fn('bob');
select * from station_detail_view WHERE id='foobar';
select * from station_detail_view WHERE id='bobs-palace';