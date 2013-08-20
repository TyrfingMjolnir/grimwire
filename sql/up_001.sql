CREATE EXTENSION "uuid-ossp";

CREATE TYPE basicStatusEnum AS ENUM ('Active', 'Inactive');

CREATE TABLE users (
	id SERIAL UNIQUE,

	name VARCHAR(32) NOT NULL,
	email VARCHAR(256),
	password VARCHAR(256),

	created_at TIMESTAMP DEFAULT NOW(),
	registered_at TIMESTAMP,
	status basicStatusEnum DEFAULT 'Active'
);

CREATE TABLE apps (
	id SERIAL UNIQUE,
	owning_user_id INT REFERENCES users(id),

	name VARCHAR(256) NOT NULL,
	redirect_url VARCHAR(1024),

	created_at TIMESTAMP DEFAULT NOW(),
	status basicStatusEnum DEFAULT 'Active'
);

CREATE TABLE user_auth_tokens (
	id UUID UNIQUE,
	src_user_id INT REFERENCES users(id) ON DELETE CASCADE,
	dst_user_id INT REFERENCES users(id) ON DELETE CASCADE,

	expires_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE app_auth_tokens (
	id UUID UNIQUE,
	user_id INT REFERENCES users(id) ON DELETE CASCADE,
	app_id INT REFERENCES apps(id) ON DELETE CASCADE,

	expires_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_presences (
	id SERIAL UNIQUE,
	user_id INT REFERENCES users(id) ON DELETE CASCADE,
	app_id INT REFERENCES apps(id) ON DELETE CASCADE,

	created_at TIMESTAMP DEFAULT NOW()
);