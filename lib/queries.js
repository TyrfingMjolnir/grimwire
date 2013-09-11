var uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = function(pgClient) {
	var db = { pgClient: pgClient };
	db.getUser = function(userId, cb) {
		pgClient.query('SELECT * FROM users WHERE id=$1', [userId], cb);
	};
	db.getUsers = function(cb) {
		pgClient.query('SELECT * FROM users', cb);
	};
	db.updateUser = function(userId, data, cb) {
		// Construct query
		var updates = [], values = [userId];
		for (var k in data) {
			values.push(data[k]);
			updates.push(k+'=$'+(values.length));
		}
		pgClient.query('UPDATE users SET '+updates.join(', ')+' WHERE id=$1', values, cb);
	};
	db.getSession = function(sessionId, cb) {
		if (uuidRE.test(sessionId) === false) { return cb(null, null); }
		pgClient.query('SELECT * FROM sessions WHERE id=$1', [sessionId], cb);
	};
	db.createSession = function(userId, app, cb) {
		if (!app) {
			app = null;
		}
		pgClient.query('INSERT INTO sessions (id, user_id, app, expires_at) VALUES(uuid_generate_v4(), $1, $2, now() + interval \'1 day\') RETURNING id', [userId, app], cb);
	};
	return db;
};