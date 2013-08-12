INSERT INTO users (name) VALUES ('pfraze');
INSERT INTO users (name) VALUES ('bob');
INSERT INTO apps (owning_user_id, name) SELECT id, 'Debug App' FROM users WHERE name='pfraze';
INSERT INTO app_auth_tokens (id, user_id, app_id) SELECT uuid_generate_v4(), owning_user_id, id FROM apps WHERE name='Debug App';
INSERT INTO app_auth_tokens (id, user_id, app_id) SELECT uuid_generate_v4(), (SELECT id FROM users WHERE name='bob'), (SELECT id FROM apps WHERE name='Debug App');
INSERT INTO user_auth_tokens (id, src_user_id, dst_user_id) SELECT uuid_generate_v4(), (SELECT id FROM users WHERE name='pfraze'), (SELECT id FROM users WHERE name='bob');
INSERT INTO user_auth_tokens (id, src_user_id, dst_user_id) SELECT uuid_generate_v4(), (SELECT id FROM users WHERE name='bob'), (SELECT id FROM users WHERE name='pfraze');
INSERT INTO user_presences (user_id, app_id) SELECT (SELECT id FROM users WHERE name='bob'), (SELECT id FROM apps WHERE name='Debug App');