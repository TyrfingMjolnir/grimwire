var http = require('http');
var pg = require('pg');
var express = require('express');


// Server State
// ============
var server = express();
server.pgClient = new pg.Client("postgres://pfraze:password@localhost:5433/grimwire");
server.streams = {};
server.stationStreamIds = {};


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
	// Get the list of active stations
	server.pgClient.query('SELECT id, name FROM active_public_stations_list_view', function(err, res) {
		if (err) {
			return ERRinternal(request, response, 'Failed to get station info from DB', err);
		}

		// Set link header
		response.setHeader('link',
			'<http://grimwire.net:8000>; rel="via service grimwire.com/-webprn/service"; title="Grimwire.net WebPRN", '+
			'<http://grimwire.net:8000/s>; rel="self collection grimwire.com/-webprn/relays"; id="stations", '+
			'<http://grimwire.net:8000/s/{id}>; rel="item grimwire.com/-webprn/relay"'
		);
		// Route by method
		if (request.method == 'HEAD') {
			response.send(204);
			return;
		}
		if (request.method != 'GET') {
			return ERRbadmethod(request, response);
		}
		if (!request.accepts('json')) {
			return ERRbadaccept(request, response);
		}

		response.json({ rows: res.rows });
	});
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


// Station
// =======
server.all('/:stationId',
	authorize,
	function (request, response, next) {
		// Attempt to fetch station info
		getStation(request.params.stationId, function(err, stationInfo) {
			if (err) {
				return ERRinternal(request, response, 'Failed to get station info from DB', err);
			}

			// User-specific data
			if (stationInfo) {
				stationInfo.user_is_invited  = userIsInvited(stationInfo, response.locals.userId);
			}
			response.locals.stationInfo = stationInfo;
			response.locals.stationId = request.params.stationId;
			next();
		});
	},
	function (request, response, next) {
		// Set link header
		response.setHeader('link',
			'<http://grimwire.net:8000>; rel="via service grimwire.com/-webprn/service"; title="Grimwire.net WebPRN", '+
			'<http://grimwire.net:8000/s>; rel="up collection grimwire.com/-webprn/relays"; id="stations", '+
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'>; rel="self item grimwire.com/-webprn/relay"; id="'+response.locals.stationId+'", '+
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'/streams>; rel="collection"; id="streams"'
		);

		// Route by method
		if (request.method == 'HEAD') {
			response.send(204);
			return;
		}
		if (request.method != 'GET') {
			return next('route');
		}

		// Check existence
		if (!response.locals.stationInfo) {
			return ERRnotfound(request, response);
		}

		if (request.accepts('json')) {
			// Permissions
			if (!response.locals.stationInfo.user_is_invited) {
				// Uninvited view
				response.locals.stationInfo = {
					id: response.locals.stationInfo.id,
					name: response.locals.stationInfo.name,
					status: response.locals.stationInfo.status,
					user_is_invited: false
				};
			}

			// GET json
			response.json(response.locals.stationInfo);
			return;
		}
		if (request.accepts('text/event-stream')) {
			// Permissions
			if (!response.locals.stationInfo.user_is_invited) {
				return ERRforbidden(request, response);
			}

			// Announce
			var query = 'INSERT INTO user_presences (station_id, app_id, user_id) VALUES ($1, $2, $3) RETURNING id';
			server.pgClient.query(query, [request.params.stationId, response.locals.appId, response.locals.userId], function(err, res) {
				if (err) {
					return ERRinternal(request, response, 'Failed to update user presence in DB', err);
				}
				if (!res.rows[0]) {
					return ERRinternal(request, response, 'Failed to create user presence entry in DB', err);
				}

				// Store connection
				var streamId = response.locals.streamId = res.rows[0].id;
				var stationStreamIds = addStream(streamId, response);

				// Send back stream header
				response.writeHead(200, 'ok', {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache',
					'connection': 'keepalive'
				});

				// Write the ident message
				var identJSON = JSON.stringify({ stream: streamId, user: response.locals.userId, app: response.locals.appId });
				emitTo(streamId, 'event: ident\r\ndata: '+identJSON+'\r\n\r\n');

				// Write the join message to all but the new stream
				emitTo(stationStreamIds, 'event: join\r\ndata: '+identJSON+'\r\n\r\n', streamId);
			});
			return;
		}
		ERRbadaccept(request, response);
	}
);
server.patch('/:stationId',
	function (request, response, next) {
		var stationInfo = response.locals.stationInfo;

		// Validate content types
		if (!request.accepts('json')) {
			return ERRbadaccept(request, response);
		}
		if (!request.is('json')) {
			res.writeHead(415, 'bad content-type: must be json');
			res.end();
			return;
		}

		// Validate inputs
		var errors = validateStationPatch(request.body);
		if (errors) {
			response.writeHead(422, 'bad entity', { 'content-type': 'application/json' });
			response.end(JSON.stringify(errors));
			return;
		}

		if (stationInfo) {
			// Check permissions
			if (stationInfo.admins.indexOf(response.locals.userId) === -1) {
				return ERRforbidden(request, response);
			}

			// Update station
			var query =
				'UPDATE stations SET '+
					'name = $2, '+
					'invites = $3, '+
					'admins = $4, '+
					'hosters = $5, '+
					'allowed_apps = $6, '+
					'recommended_apps = $7, '+
					'is_public = $8 '+
				'WHERE stations.id = $1';
			var values = [
				request.params.stationId,
				request.body.name || stationInfo.name,
				(typeof request.body.invites == 'undefined') ? stationInfo.invites : request.body.invites,
				(typeof request.body.admins == 'undefined') ? stationInfo.admins : request.body.admins,
				(typeof request.body.hosters == 'undefined') ? stationInfo.hosters : request.body.hosters,
				(typeof request.body.allowed_apps == 'undefined') ? stationInfo.allowed_apps : request.body.allowed_apps,
				(typeof request.body.recommended_apps == 'undefined') ? stationInfo.recommended_apps : request.body.recommended_apps,
				(!request.body.invites || request.body.invites.length === 0)
			];
			server.pgClient.query(query, values, function(err, res) {
				if (err) {
					return ERRinternal(request, response, 'Failed to update station in DB', err);
				}

				response.writeHead(204, 'ok, no content');
				response.end();
			});
		} else {
			// Create station
			var query =
				'INSERT INTO stations (id, owning_user_id, name, invites, admins, hosters, allowed_apps, recommended_apps, is_public) '+
				'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
			var values = [
				request.params.stationId,
				response.locals.userId,
				request.body.name,
				request.body.invites,
				request.body.admins || [response.locals.userId],
				request.body.hosters,
				request.body.allowed_apps,
				request.body.recommended_apps,
				!request.body.invites || request.body.invites.length === 0
			];
			server.pgClient.query(query, values, function(err, res) {
				if (err) {
					return ERRinternal(request, response, 'Failed to update station in DB', err);
				}

				response.writeHead(204, 'ok, no content');
				response.end();
			});
		}
	}
);
server.delete('/:stationId',
	function (request, response, next) {
		var stationInfo = response.locals.stationInfo;

		// Check permissions
		if (stationInfo.admins.indexOf(response.locals.userId) === -1) {
			return ERRforbidden(request, response);
		}

		// Remove station record
		server.pgClient.query('DELETE FROM stations WHERE stations.id = $1', [request.params.stationId], function(err, res) {
			if (err) {
				return ERRinternal(request, response, 'Failed to remove station from DB', err);
			}

			response.writeHead(204, 'ok, no content');
			response.end();
		});
	}
);
server.all('/:stationId', ERRbadmethod);


// Station Streams
// ===============
server.all('/:stationId/streams',
	authorize,
	getStationMiddleware,
	function (request, response, next) {
		// Set link header
		var linkHeader = [
			'<http://grimwire.net:8000>; rel="via service grimwire.com/-webprn/service"; title="Grimwire.net WebPRN"',
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'>; rel="up item grimwire.com/-webprn/relay"; id="'+response.locals.stationId+'"',
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'/streams>; rel="self collection"; id="streams"'
		];
		if (response.locals.stationInfo.user_is_invited) {
			(server.stationStreamIds[response.locals.stationId] || []).forEach(function(streamId) {
				linkHeader.push('<http://grimwire.net:8000/s/'+response.locals.stationId+'/streams/'+streamId+'>; rel="item"; id="'+streamId+'"');
			});
		}
		response.setHeader('link', linkHeader.join(', '));

		// Route by method
		if (request.method == 'HEAD') {
			response.send(204);
			return;
		}
	}
);
server.all('/:stationId/streams', ERRbadmethod);


// Station Stream
// ==============
server.all('/:stationId/streams/:streamId',
	authorize,
	getStationMiddleware,
	function (request, response, next) {
		var streamId = request.params.streamId;
		var stream = server.streams[streamId];

		// Make sure the stream belongs to the station
		if (!stream || stream.locals.stationId != response.locals.stationId) {
			return ERRnotfound(request, response);
		}

		// Check permissions
		if (!response.locals.stationInfo.user_is_invited) {
			return ERRforbidden(request, response);
		}

		// Set link header
		var linkHeader = [
			'<http://grimwire.net:8000>; rel="via service grimwire.com/-webprn/service"; title="Grimwire.net WebPRN"',
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'/streams>; rel="up collection"; id="streams"',
			'<http://grimwire.net:8000/s/'+response.locals.stationId+'/streams/'+streamId+'>; rel="self item"; id="'+streamId+'"'
		];
		response.setHeader('link', linkHeader.join(', '));

		// Route by method
		if (request.method == 'HEAD') {
			response.send(204);
			return;
		}
		if (request.method != 'GET') {
			return next('route');
		}

		if (request.accepts('json')) {
			// Make sure the stream belongs to the station
			var stream = server.streams[streamId];
			if (stream.locals.stationId != response.locals.stationId) {
				return ERRnotfound(request, response);
			}

			// GET json
			response.json({ stream: streamId, user: stream.locals.userId, app: stream.locals.appId });
			return;
		}
		ERRbadaccept(request, response);
	}
);
server.post('/:stationId/streams/:streamId',
	function (request, response, next) {
		var streamId = request.params.streamId;

		if (request.is('json')) {
			if (!request.body.event || typeof request.body.event != 'string') {
				response.writeHead(422, 'bad entity - `event` is a required string');
				response.end();
				return;
			}
			msg = 'event: '+request.body.event+'\r\n';
			if (request.body.data) {
				msg += 'data: '+JSON.stringify(request.body.data)+'\r\n';
			}
			emitTo(streamId, msg+'\r\n');
			response.writeHead(204, 'ok no content');
			response.end();
			return;
		}
		ERRbadctype(request, response);
	}
);
server.all('/:stationId/streams/:streamId', ERRbadmethod);


// Stream Helpers
// ==============
function emitTo(streamIds, msg, exclude) {
	if (!Array.isArray(streamIds)) { streamIds = [streamIds]; }
	if (exclude && !Array.isArray(exclude)) { exclude = [exclude]; }
	streamIds.forEach(function(streamId) {
		if (exclude && exclude.indexOf(streamId) != -1) {
			return;
		}
		var stream = server.streams[streamId];
		if (!stream) {
			console.error('Stream ID given for nonexistant stream', streamId);
			return;
		}
		stream.write(msg);
	});
}

function addStream(streamId, response) {
	// Track the stream
	server.streams[streamId] = response;
	// Track the stream ID on the station
	var stationStreamIds = server.stationStreamIds[response.locals.stationId];
	if (!stationStreamIds) {
		stationStreamIds = server.stationStreamIds[response.locals.stationId] = [];
	}
	stationStreamIds.push(streamId);
	// Wire up close behavior
	response.on('close', onStreamClosed);
	return stationStreamIds;
}

function removeStream(stationId, streamId) {
	// Remove the station's track of the stream ID
	var ids = server.stationStreamIds[stationId];
	if (ids) {
		ids.splice(ids.indexOf(streamId), 1);
		if (ids.length === 0) {
			delete server.stationStreamIds[stationId];
		}
	}
	// Remove the server's track of the stream
	delete server.streams[streamId];
	return ids || [];
}

// - handles stream close by client
function onStreamClosed() {
	var response = this;

	// Clear connection
	response.removeAllListeners('close');
	var remainingStreamIds = removeStream(response.locals.stationId, response.locals.streamId);

	// De-announce
	server.pgClient.query('DELETE FROM user_presences WHERE id=$1', [response.locals.streamId], function(err) {
		if (err)
			console.error('Failed to delete user presence from DB', err);
	});

	// Emit 'part' event
	if (remainingStreamIds) {
		var identJSON = JSON.stringify({ stream: response.locals.streamId, user: response.locals.userId, app: response.locals.appId });
		emitTo(remainingStreamIds, 'event: part\r\ndata: '+identJSON+'\r\n\r\n');
	}
}


// Query Helpers
// ==============
function getStation(stationId, cb) {
	server.pgClient.query('SELECT * FROM station_detail_view WHERE id=$1', [stationId], function(err, res) {
		if (err) {
			return cb(err);
		}
		if (res.rows.length === 0) {
			cb(null, null);
		} else {
			// Fill out station info
			var stationInfo = res.rows[0];
			stationInfo.admins           = stationInfo.admins || [];
			stationInfo.invites          = stationInfo.invites || [];
			stationInfo.hosters          = stationInfo.hosters || [];
			stationInfo.allowed_apps     = stationInfo.allowed_apps || [];
			stationInfo.recommended_apps = stationInfo.recommended_apps || [];
			stationInfo.online_users     = stationInfo.online_users || [];

			try {
				// :TEMP: Remap the online_users output until we find a SQL solution
				stationInfo.online_users = stationInfo.online_users.map(function(online_user) {
					return { stream: online_user.f1, user: online_user.f2, app: online_user.f3 };
				});
			} catch(e) { console.warn('Failure mapping stationInfo.online_users', e); }

			cb(null, stationInfo);
		}
	});
}


// Business Logic
// ==============
function validateStationPatch(body) {
	var nonString = function(v) { return typeof v != 'string'; };
	if (!body) {
		return { errors: ['Body is required.'] };
	}
	var errors = [];
	[
		'invites',
		'admins',
		'hosters',
		'allowed_apps',
		'recommended_apps'
	].forEach(function(k) {
		if (!body[k]) {
			body[k] = null;
			return;
		}
		if (typeof body[k] == 'string') {
			body[k] = body[k].split(/[\s,]+/g);
		}
		if (!Array.isArray(body[k]) || body[k].filter(nonString).length > 0) {
			errors.push('`'+k+'` must be a comma-separated string or array of strings');
		}
	});
	if (body.name && typeof body.name != 'string') {
		errors.push('`name` must be a string');
	}
	if (errors.length > 0) {
		return { errors: errors };
	}
	return false;
}
function userIsInvited(stationInfo, userId) {
	// Either the user is an admin, there are no invites, or the user is invited
	return (
		(stationInfo.admins && stationInfo.admins.indexOf(userId) !== -1) ||
		(!stationInfo.invites || (stationInfo.invites.length === 0 || stationInfo.invites.indexOf(userId) !== -1))
	);
}


// Common Middleware
// =================

// Auth
// - adds response.locals.appId on success
var uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ^ http://stackoverflow.com/a/13653180
function authorize(request, response, next) {
	response.locals.userId = 'pfraze'; // :TODO: temporary until auth is added
	response.locals.appId = 'debug.grimwire.com';
	return next();
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

function getStationMiddleware(request, response, next) {
	getStation(request.params.stationId, function(err, stationInfo) {
		if (err) {
			return ERRinternal(request, response, 'Failed to get station info from DB', err);
		}
		if (!stationInfo) {
			return ERRnotfound(request, response);
		}

		// User-specific data
		stationInfo.user_is_invited  = userIsInvited(stationInfo, response.locals.userId);
		response.locals.stationInfo = stationInfo;
		response.locals.stationId = request.params.stationId;
		next();
	});
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
function ERRbadctype(request, response, msg) { response.writeHead(415, 'bad content-type'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRbadent(request, response, msg) { response.writeHead(422, 'bad entity'); response.end((typeof msg == 'string') ? msg : undefined); }
function ERRinternal(request, response, msg, exception) {
	console.error(msg, exception);
	response.writeHead(500, 'internal error');
	response.end(msg);
}


module.exports = server;
if (!module.parent) {
	// Setup
	// =====
	server.pgClient.connect(function(err) {
		if (err) {
			console.error("Failed to connect to postgres", err);
			process.exit();
		}

		// :TODO: should clear out any user presences that might have been left over
	});
	server.listen(8000);
	server.startTime = new Date();
	console.log('Signalling HTTP server listening on port 8000');
}