var uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports.getUser = function(pgClient, userId, cb) {
	queryTake1(pgClient, 'SELECT * FROM users WHERE id=$1', [userId], cb);
};
module.exports.getSession = function(pgClient, sessionId, cb) {
	if (uuidRE.test(sessionId) === false) { return cb(null, null); }
	queryTake1(pgClient, 'SELECT * FROM sessions WHERE id=$1', [sessionId], cb);
};
module.exports.createSession = function(pgClient, userId, cb) {
	queryTake1(pgClient, 'INSERT INTO sessions (id, user_id) VALUES(uuid_generate_v4(), $1) RETURNING id', [userId], cb);
};

// Helper, runs the query then provides the first row
function queryTake1(pgClient, query, params, cb) {
	pgClient.query(query, params, function(err, res) {
		if (err) {
			return cb(err);
		}
		cb(null, (res.rows.length !== 0) ? res.rows[0] : null);
	});
}