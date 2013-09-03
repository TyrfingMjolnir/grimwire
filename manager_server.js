var http = require('http');
var pg = require('pg');
var express = require('express');
var middleware = require('./lib/middleware.js');

// Server State
// ============
var server = express();
var pgClient = new pg.Client("postgres://pfraze:password@localhost:5433/grimwire");


// Common Handlers
// ===============
server.use(express.bodyParser());
server.use(express.cookieParser());
server.use(express.cookieSession({ secret: 'TODO -- INSERT SECRET TOKEN HERE' }));
server.all('*', middleware.setCorsHeaders);
server.options('*', function(request, response) {
	response.writeHead(204);
	response.end();
});


// Server definition
// =================
server.all('/', function(req, res, next) {
	res.setHeader('Link', [
		'<http://grimwire.net:8000/>; rel="self service via grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
		'<http://grimwire.net:8000/u>; rel="collection grimwire.com/-p2pw/peers"; id="users"',
		'<http://grimwire.net:8000/session>; rel="service grimwire.com/-session"; id="session"',
		'<http://grimwire.net:8000/status>; rel="service"; id="status"'
	].join(', '));
	next();
});
server.head('/', function(req, res) { res.send(204); });
server.get('/',
	middleware.authorize(pgClient),
	function(req, res, next) {
		return res.format({
			'text/html': function() { res.send(require('fs').readFileSync('./static/dashboard.html').toString()); },
			'application/json': function() { res.json({ msg: 'hello' }); }
		});
	}
);
// Servers
server.use('/', express.static(__dirname + '/static'));
server.use('/session', require('./servers/session.js')(pgClient));


// Admin
// =====
server.get('/status', function(request, response) {
	response.setHeader('Link', [
		'<http://grimwire.net:8000/>; rel="up service via grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
		'<http://grimwire.net:8000/status>; rel="self service"; id="status"'
	].join(', '));
	var uptime = (new Date() - server.startTime);
	response.json({
		started_at: server.startTime.toLocaleString(),
		uptime_seconds: uptime/1000,
		uptime_minutes: uptime/(60*1000),
		uptime_hours: uptime/(60*60*1000),
		uptime_days: uptime/(24*60*60*1000)
	});
});


// Setup
// =====
pgClient.connect(function(err) {
	if (err) {
		console.error("Failed to connect to postgres", err);
		process.exit();
	}
});
server.listen(8000);
server.startTime = new Date();
console.log('Management HTTP server listening on port 8000');