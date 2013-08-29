CREATE EXTENSION "uuid-ossp";

CREATE TYPE basicStatusEnum AS ENUM ('Active', 'Inactive');


-- Primitives
--
CREATE TABLE users (
	id VARCHAR(32) PRIMARY KEY,

	email VARCHAR(256),
	password VARCHAR(256) NOT NULL,

	created_at TIMESTAMP DEFAULT NOW(),
	status basicStatusEnum DEFAULT 'Active'
);
CREATE TABLE stations (
	id VARCHAR(32) PRIMARY KEY,
	owning_user_id VARCHAR(32) REFERENCES users(id),

	name VARCHAR(256),
	invites VARCHAR(32)[],
	admins VARCHAR(32)[],
	hosters VARCHAR(32)[],
	allowed_apps VARCHAR(256)[],
	recommended_apps VARCHAR(256)[],

	created_at TIMESTAMP DEFAULT NOW(),
	is_public BOOLEAN,
	status basicStatusEnum DEFAULT 'Active'
);
CREATE TABLE apps (
	id VARCHAR(256) PRIMARY KEY,

	created_at TIMESTAMP DEFAULT NOW(),
	status basicStatusEnum DEFAULT 'Active'
);


-- Station presence & auth
--
CREATE TABLE sessions (
	id UUID PRIMARY KEY,
	user_id VARCHAR(32) REFERENCES users(id) ON DELETE CASCADE,
	expires_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE app_auth_tokens (
	id UUID PRIMARY KEY,
	station_id VARCHAR(32) REFERENCES stations(id) ON DELETE CASCADE,
	user_id VARCHAR(32) REFERENCES users(id) ON DELETE CASCADE,
	app_id VARCHAR(256),

	expires_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE user_presences (
	id SERIAL PRIMARY KEY,
	station_id VARCHAR(32) REFERENCES stations(id) ON DELETE CASCADE,
	user_id VARCHAR(32) REFERENCES users(id) ON DELETE CASCADE,
	app_id VARCHAR(256),

	created_at TIMESTAMP DEFAULT NOW(),
	closed_at TIMESTAMP,
	status basicStatusEnum DEFAULT 'Active'
);


-- Views/Functions
--

-- Active stations
CREATE VIEW active_public_stations_list_view AS
	SELECT
		s.id,
		s.name
	FROM stations s
	WHERE
		s.is_public = 't'
		AND s.status = 'Active';

-- Active stations with nobody in them
CREATE VIEW empty_active_stations_list_view AS
	SELECT
		s.id,
		s.name
	FROM stations s
	WHERE
		s.status = 'Active'
		AND (SELECT COUNT(id) FROM user_presences WHERE station_id = s.id) = 0;

-- The stations the user is active in, and the apps they're using
CREATE FUNCTION user_online_stations_fn(_user_id varchar(32))
RETURNS TABLE (id varchar(32), name varchar(256), apps varchar(256)[])
LANGUAGE sql AS
$BODY$
	SELECT
		s.id,
		s.name,
		array_agg(up.app_id) AS apps
	FROM stations s
		INNER JOIN user_presences up ON up.station_id = s.id AND up.user_id = $1 AND up.status = 'Active'
	GROUP BY s.id;
$BODY$;

-- Station details
CREATE VIEW station_detail_view AS
	SELECT
		s.id,
		s.name,
		s.admins,
		s.invites,
		s.hosters,
		s.allowed_apps,
		s.recommended_apps,
		(SELECT ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(ROW(id,user_id,app_id)))) FROM user_presences up WHERE up.station_id = s.id) AS online_users,
		s.status,
		s.created_at
	FROM stations s;

-- Station update function
CREATE FUNCTION update_station_fn(_user_id varchar(32))
RETURNS TABLE (id varchar(32), name varchar(256), apps varchar(256)[])
LANGUAGE sql AS
$BODY$
	SELECT
		s.id,
		s.name,
		array_agg(up.app_id) AS apps
	FROM stations s
		INNER JOIN user_presences up ON up.station_id = s.id AND up.user_id = $1 AND up.status = 'Active'
	GROUP BY s.id;
$BODY$;