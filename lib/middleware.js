// Common Middleware
// =================

// Authenticate either the session cookie or the app access token
// - adds response.locals.session on success
module.exports.authenticate = function(db) {
	return function(req, res, next) {
		// Helper to send 401
		var authFail = function() {
			if (req.accepts('html')) {
				res.send(401, getLoginHtml());
			} else {
				res.send(401);
			}
		};

		// Get session id from cookie or auth header (the latter is for x-domain)
		var sessionId = req.session;
		if (typeof sessionId != 'string' && req.headers.authorization && req.headers.authorization.indexOf('Bearer') === 0) {
			// Skip 'Bearer '
			var token = req.headers.authorization.slice(7);
			// Token format is 'username:session_id', extract the latter
			if (token) {
				sessionId = token.split(':')[1];
			}
		}
		if (!sessionId) {
			return authFail();
		}

		// Fetch from DB
		db.getSession(sessionId, function(err, dbres) {
			if (err) {
				res.send(500);
				console.error('Failed to get session info from DB', err);
				return;
			}

			// Session exists?
			if (!dbres || !dbres.rows[0]) {
				return authFail();
			}

			// Session expired?
			// :TODO: is session expired?

			// Continue
			res.locals.session = dbres.rows[0];
			next();
		});
	};
};
function getLoginHtml() { return require('fs').readFileSync('./static/login.html').toString(); }

module.exports.setCorsHeaders = function(request, response, next) {
	response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
	response.setHeader('Access-Control-Allow-Credentials', true);
	response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, HEAD, GET, PUT, PATCH, POST, DELETE, NOTIFY, SUBSCRIBE');
	response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || '');
	response.setHeader('Access-Control-Expose-Headers', request.headers['access-control-request-headers'] || 'Content-Type, Content-Length, Date, ETag, Last-Modified, Link, Location');
	next();
};