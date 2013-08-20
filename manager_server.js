var http = require('http');
var pg = require('pg');
var express = require('express');


// Server State
// ============
var server = express();
server.pgClient = new pg.Client("postgres://pfraze:password@localhost:5433/grimwire");


// Common Handlers
// ===============
server.use(express.bodyParser());
server.all('*', setCorsHeaders);
server.options('*', function(request, response) {
	response.writeHead(204);
	response.end();
});
server.use('/_', express.static(__dirname + '/static'));


// Root
// ====
server.get('/', function(request, response) {
	response.writeHead(200, 'ok');
	response.end('manager server');
});


// Tooling
// =======
server.get('/status', function(request, response) {
	var uptime = (new Date() - server.startTime);
	response.json({
		started_at: server.startTime.toLocaleString(),
		uptime_seconds: uptime/1000,
		uptime_minutes: uptime/(60*1000),
		uptime_hours: uptime/(60*60*1000),
		uptime_days: uptime/(24*60*60*1000)
	});
});


// Users
// =====
server.get('/u',
	authorize,
	ERRtodo
);
server.get('/u/:userId',
	authorize,
	ERRtodo
);


// Apps
// ====
server.get('/a',
	authorize,
	ERRtodo
);
server.get('/a/:appId',
	authorize,
	ERRtodo
);


// Common Middleware
// =================

// Auth
// - adds response.locals.authedUserId and authedUserName on success
function authorize(request, response, next) {
	var user = parseAuthBasic(request.headers.authorization);
	var query = [
		'SELECT id FROM users',
			'WHERE name = $1',
			'AND password = $2',
			'AND status = \'Active\''
	].join(' ');
	server.pgClient.query(query, [user[0], user[1]], function(err, res) {
		if (err)
			return ERRinternal(request, response, 'Failed to fetch user record from DB', err);

		if (!res.rows[0])
			return ERRforbidden(request, response, 'Invalid auth credentials');

		request.params.authedUserId = res.rows[0].id;
		request.params.authedUserName = user[0];
		next();
	});
}
function parseAuthToken(authHeader) {
	if (!authHeader || authHeader.indexOf('Basic ') !== 0)
		return null;
	authHeader = new Buffer(authHeader.slice(6).trim(), 'base64').toString();
	return authHeader.split(':');
}

function setCorsHeaders(request, response, next) {
	response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
	response.setHeader('Access-Control-Allow-Credentials', true);
	response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, HEAD, GET, PUT, PATCH, POST, DELETE, NOTIFY, SUBSCRIBE');
	response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || '');
	response.setHeader('Access-Control-Expose-Headers', request.headers['access-control-request-headers'] || 'Content-Type, Content-Length, Date, ETag, Last-Modified, Link, Location');
	next();
}


// Error Responses
// ===============
function ERRforbidden(request, response, msg) { response.writeHead(403, 'forbidden'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRnotfound(request, response, msg) { response.writeHead(404, 'not found'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRbadmethod(request, response, msg) { response.writeHead(405, 'bad method'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRbadaccept(request, response, msg) { response.writeHead(406, 'bad accept'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRbadent(request, response, msg) { response.writeHead(422, 'bad entity'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRtodo(request, response, msg) { response.writeHead(503, 'not yet implemented'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRinternal(request, response, msg, exception) {
	console.error(msg, exception);
	response.writeHead(500, 'internal error');
	response.end(msg);
}


// Setup
// =====
server.pgClient.connect(function(err) {
	if (err) {
		console.error("Failed to connect to postgres", err);
		process.exit();
	}
});
server.listen(8000);
server.startTime = new Date();
console.log('Management HTTP server listening on port 8000');