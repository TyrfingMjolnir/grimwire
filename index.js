var http = require('http');

// Server State
var streams = {};

// Server
var server = http.createServer(function(request, response) {
	setCorsHeaders(request, response);

	// Route request
	if (request.method == 'OPTIONS')
		return OPTIONSall(request, response);
	if (request.url == '/') {
		if (request.method == 'GET')
			return GETroot(request, response);
		return ERRbadmethod(request, response);
	} else {
		response.targetUserId = request.url.slice(1);
		if (request.method == 'SUBSCRIBE')
			return SUBuser(request, response);
		return ERRbadmethod(request, response);
	}
});
server.listen(8000);

// Base Handlers
// =============
function OPTIONSall(request, response) {
	response.writeHead(204);
	response.end();
}
function GETroot(request, response) {
	// :TODO:
	response.writeHead(200, 'ok');
	response.end('signal server');
}

// User Signal Stream
// ==================
function SUBuser(request, response) {
	authorize(request, response, SUBuser_announce);
}
function SUBuser_announce(request, response) {
	// :TODO: INSERT INTO online_apps (app_id, user_id) VALUES ($0, $1)
	SUBuser_addstream(request, response);
}
function SUBuser_addstream(request, response) {
	var streamId = response.originAppId+'-'+response.targetUserId;
	if (streams[streamId]) // one stream at a time
		endOldStream(streams[streamId]);
	addStream(streamId, response);
	/*:DEBUG:*/ do_debug_stream_output(response);
}
// - wires up a new stream
function addStream(streamId, response) {
	response.streamId = streamId;
	streams[streamId] = response;
	response.on('close', onStreamClosed);

	response.writeHead(200, 'ok', {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		'connection': 'keepalive'
	});
}
// - ends a stream that's been displaced by a new stream
function endOldStream(oldStream) {
	/*:DEBUG:*/clearInterval(oldStream.debug_interval);
	oldStream.removeAllListeners('close');
	oldStream.end();
}
// - handles stream close by client
function onStreamClosed() {
	var response = this;
	response.removeAllListeners('close');
	/*:DEBUG:*/clearInterval(response.debug_interval);
	// :TODO: DELETE FROM online_apps WHERE app_id=$0 AND user_id=$1, [response.originAppId, response.targetUserId]
	delete streams[response.streamId];
}

function do_debug_stream_output(response) {
	var i=0;
	response.debug_interval = setInterval(function() {
		console.log('event', i);
		response.write('event: test\r\n');
		response.write('data: {"foo":'+i+'}\r\n\r\n');
		i++;
		if (i > 5) {
			clearInterval(response.debug_interval);
			response.removeAllListeners('close');
			response.end();
		}
	}, 1000);
}

// Auth
// ====
// - adds response.originAppId on success
function authorize(request, response, cb) {
	// var token = parseAuthToken(request.headers.authorization)
	// :TODO: SELECT app_id FROM auth_tokens WHERE user_id = $0 AND id = $1, [response.targetUserId, token]
	/* if (results==0)
		return ERRforbidden(request, response); */
	response.originAppId = 'foobar';
	cb(request, response);
}

// Response Helpers
// ================
function setCorsHeaders(request, response) {
	response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
	response.setHeader('Access-Control-Allow-Credentials', true);
	response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, HEAD, GET, PUT, PATCH, POST, DELETE, NOTIFY, SUBSCRIBE');
	response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || '');
	response.setHeader('Access-Control-Expose-Headers', request.headers['access-control-request-headers'] || 'Content-Type, Content-Length, Date, ETag, Last-Modified, Link, Location');
}

// Error Responses
// ===============
function ERRforbidden(request, response) { response.writeHead(403, 'forbidden'); response.end(); }
function ERRbadmethod(request, response) { response.writeHead(405, 'bad method'); response.end(); }
function ERRinternal(request, response, err) {
	console.log('INTERNAL ERROR', err);
	response.writeHead(500, 'internal error');
	response.end();
}