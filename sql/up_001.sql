CREATE EXTENSION "uuid-ossp";

CREATE TYPE basicStatusEnum AS ENUM ('Active', 'Inactive');


CREATE TABLE users (
	id VARCHAR(32) PRIMARY KEY,

	email VARCHAR(256),
	password VARCHAR(256) NOT NULL,
	trusted_peers VARCHAR(32)[] DEFAULT '{}',

	created_at TIMESTAMP DEFAULT NOW(),
	status basicStatusEnum DEFAULT 'Active'
);
CREATE TABLE sessions (
	id UUID PRIMARY KEY,
	user_id VARCHAR(32) REFERENCES users(id) ON DELETE CASCADE,
	app VARCHAR(256) DEFAULT NULL,

	expires_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT NOW()
);