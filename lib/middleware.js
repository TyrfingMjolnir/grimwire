// Common Middleware
// =================

var queries = require('./queries.js');

// Auth
// - adds response.locals.session on success
module.exports.authorize = function(pgClient) {
	return function(req, res, next) {
		queries.getSession(pgClient, req.session, function(err, session) {
			if (err) {
				res.send(500);
				console.error('Failed to get session info from DB', err);
				return;
			}
			if (!session) {
				if (req.accepts('html')) {
					res.send(401, getLoginHtml());
				} else {
					res.send(401);
				}
				return;
			}
			res.locals.session = session;
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