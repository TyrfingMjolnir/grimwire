var http = require('http');
var https = require('https');
var pg = require('pg');
var express = require('express');
var middleware = require('./lib/middleware.js');
var winston = require('winston');

// Config
// ======
var os = require("os");
var config = {
	hostname: process.env.HOST || os.hostname(),
	port: process.env.PORT || (process.env.SSL ? 443 : 80),
	ssl: process.env.SSL || false,
	livemode: process.env.LIVE || false,
	pgconnstr: process.env.PG || 'postgres://pfraze:password@localhost:5433/grimwire'
};
config.url = ((config.ssl) ? 'https://' : 'http://') + config.hostname + ((config.port != '80') ? (':' + config.port) : '');

// Server State
// ============
var server = express();
var pgClient = new pg.Client(config.pgconnstr);
var db = require('./lib/queries')(pgClient);
winston.add(winston.transports.File, { filename: 'logs/relay.log', handleExceptions: config.livemode ? true  : false });

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
		'</>; rel="self service via grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
		'</u{?online}>; rel="collection grimwire.com/-p2pw/relay grimwire.com/-user"; id="users"',
		'</u/{id}{?stream,nc}>; rel="item grimwire.com/-p2pw/relay grimwire.com/-user"',
		'</session>; rel="service grimwire.com/-session"; id="session"',
		'</session/{app}>; rel="service grimwire.com/-access-token"',
		'</status>; rel="service"; id="status"'
	].join(', '));
	next();
});
server.head('/', function(req, res) { res.send(204); });
server.get('/',
	middleware.authenticate(db),
	function(req, res, next) {
		return res.format({
			'text/html': function() { res.send(require('fs').readFileSync('./static/dashboard.html').toString()); },
			'application/json': function() { res.json({ msg: 'hello' }); }
		});
	}
);
// Servers
server.use('/', express.static(__dirname + '/static'));
var usersServer = require('./servers/users.js')(config, db);
server.use('/u',       usersServer);
server.use('/session', require('./servers/session.js')(config, db));


// Admin
// =====
server.get('/status', function(request, response) {
	response.setHeader('Link', [
		'</>; rel="up service via grimwire.com/-service"; title="Grimwire.net P2PW"',
		'</status>; rel="self service"; id="status"'
	].join(', '));
	var uptime = (new Date() - server.startTime);
	response.json({
		started_at: server.startTime.toLocaleString(),
		uptime_seconds: uptime/1000,
		uptime_minutes: uptime/(60*1000),
		uptime_hours: uptime/(60*60*1000),
		uptime_days: uptime/(24*60*60*1000),
		relay: usersServer.getStatus()
	});
});


// Setup
// =====
pgClient.connect(function(err) {
	if (err) {
		winston.error("Failed to connect to postgres", err);
		process.exit();
	}
});
if (config.ssl) {
	var sslOpts = {
		key: require('fs').readFileSync('ssl-key.pem'),
		cert: require('fs').readFileSync('ssl-cert.pem')
	};
	https.createServer(sslOpts, server).listen(config.port);
} else {
	server.listen(config.port);
}
server.startTime = new Date();
winston.info('Management HTTP server listening on port '+config.port, config);