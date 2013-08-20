var http = require('http');
var pg = require('pg');
var express = require('express');


// Server State
// ============
var server = express();
server.pgClient = new pg.Client("postgres://pfraze:password@localhost:5433/grimwire");
server.streams = {};


// Common Handlers
// ===============
server.use(express.bodyParser());
server.all('*', setCorsHeaders);
server.options('*', function(request, response) {
	response.writeHead(204);
	response.end();
});


// Root
// ====
server.get('/', function(request, response) {
	response.writeHead(200, 'ok');
	response.end('signal server');
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
		uptime_days: uptime/(24*60*60*1000),
		streams: Object.keys(server.streams)
	});
});


// User
// ====
// - signal stream
server.get('/:userId',
	authorize,
	function (request, response, next) {
		if (!request.accepts('text/event-stream'))
			return next('route');

		// Announce
		var query = [
			'INSERT INTO user_presences (app_id, user_id)',
				'SELECT $1, $2 WHERE NOT EXISTS',
					'(SELECT id FROM user_presences WHERE app_id=$1 AND user_id=$2)'
		].join(' ');
		server.pgClient.query(query, [response.locals.appId, request.params.userId], function(err, res) {
			if (err)
				return ERRinternal(request, response, 'Failed to update user presence in DB', err);
			next();
		});
	},
	function (request, response) {
		var streamId = getStreamId(response.locals.appId, request.params.userId);

		// Kill an existing stream if active (only one at a time per app/user combo)
		if (server.streams[streamId]) {
			server.streams[streamId].removeAllListeners('close');
			server.streams[streamId].end();
		}

		// Store connection
		response.locals.streamId = streamId;
		response.locals.userId = request.params.userId;
		server.streams[streamId] = response;
		response.on('close', onStreamClosed);

		// Send back stream header
		response.writeHead(200, 'ok', {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'connection': 'keepalive'
		});
	}
);
server.get('/:userId', ERRbadaccept);

function getStreamId(appId, userId) {
	return appId+'-'+userId;
}

// - handles stream close by client
function onStreamClosed() {
	var response = this;

	// Clear connection
	response.removeAllListeners('close');
	delete server.streams[response.locals.streamId];

	// De-announce
	server.pgClient.query('DELETE FROM user_presences WHERE app_id=$1 AND user_id=$2', [response.locals.appId, response.locals.userId], function(err) {
		if (err)
			console.error('Failed to delete user presence from DB', err);
	});
}


// User Peers
// ==========
// - whois online
server.get('/:userId/peers',
	authorize,
	function (request, response, next) {
		if (!request.accepts('json'))
			return next('route');

		var query = [
			'SELECT apps.id as app_id, apps.name as app_name, users.id as user_id, users.name as user_name',
				'FROM user_presences',
				'INNER JOIN user_auth_tokens',
					'ON user_auth_tokens.dst_user_id = user_presences.user_id',
					'AND user_auth_tokens.src_user_id = $1',
				'INNER JOIN users ON users.id = user_presences.user_id',
				'INNER JOIN apps ON apps.id = user_presences.app_id'
		].join(' ');
		server.pgClient.query(query, [request.params.userId], function(err, res) {
			if (err)
				return ERRinternal(request, response, 'Failed to read user presences from DB', err);
			response.writeHead(200, 'ok', { 'content-type': 'application/json' });
			response.end(JSON.stringify(res.rows));
		});
	}
);
server.get('/:userId/peers', ERRbadaccept);


// User App
// ========
// - signalling target
server.notify('/:userId/apps/:targetAppId',
	authorize,
	function (request, response, next) {
		// Locate the target app's stream
		var streamId = getStreamId(request.params.targetAppId, request.params.userId);
		var stream = server.streams[streamId];
		if (!stream)
			return ERRnotfound(request, response);

		// Validate
		var body = request.body;
		if (!body)
			return ERRbadent(request, response, 'Request body is required');
		if (!body.event || (!body.data || typeof body.data != 'object'))
			return ERRbadent(request, response, 'Request body `event` and `data` fields are required');
		if (body.event != 'candidate' && body.event != 'offer' && body.event != 'answer')
			return ERRbadent(request, response, 'Request body `event` must be one of "candidate", "offer", or "answer"');

		// Emit to the target stream
		stream.write('event: '+body.event+'\r\n');
		stream.write('data: '+JSON.stringify(body.data)+'\r\n\r\n');
		response.writeHead(204, 'ok, no content');
		response.end();
	}
);


// Common Middleware
// =================

// Auth
// - adds response.locals.appId on success
var uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ^ http://stackoverflow.com/a/13653180
function authorize(request, response, next) {
	var token = parseAuthToken(request.headers.authorization);
	if (!token)
		return ERRforbidden(request, response, '`Authorization: Token <token>` required');
	if (!uuidRE.test(token))
		return ERRforbidden(request, response, 'Malformed authorization token');

	var query = [
		'SELECT app_id FROM app_auth_tokens',
			'WHERE id = $1',
			'AND user_id = $2',
			'AND (expires_at IS NULL OR expires_at > NOW())'
	].join(' ');
	server.pgClient.query(query, [token, request.params.userId], function(err, res) {
		if (err)
			return ERRinternal(request, response, 'Failed to fetch app authorization token from DB', err);

		if (!res.rows[0])
			return ERRforbidden(request, response, 'Invalid auth token');

		response.locals.appId = res.rows[0].app_id;
		next();
	});
}
function parseAuthToken(authHeader) {
	if (!authHeader || authHeader.indexOf('Token ') !== 0)
		return null;
	return authHeader.slice(6).trim();
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
server.listen(8001);
server.startTime = new Date();
console.log('Signalling HTTP server listening on port 8001');