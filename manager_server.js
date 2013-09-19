var http = require('http');
var https = require('https');
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
	is_upstream: process.env.IS_UPSTREAM || false
};
config.url = ((config.ssl) ? 'https://' : 'http://') + config.hostname + ((config.port != '80') ? (':' + config.port) : '');

// Server State
// ============
var server = express();
var db = require('./lib/db')();
winston.add(winston.transports.File, { filename: 'logs/relay.log', handleExceptions: config.livemode ? true  : false });

// Common Handlers
// ===============
server.use(express.bodyParser());
server.use(express.cookieParser());
if (config.is_upstream) {
	server.use(express.cookieSession({ proxy: true, secret: 'TODO -- INSERT SECRET TOKEN HERE', cookie: { httpOnly: true, secure: true } }));
} else {
	server.use(express.cookieSession({ secret: 'TODO -- INSERT SECRET TOKEN HERE', cookie: { httpOnly: true, secure: config.ssl } }));
}
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
			'text/html': function() { res.send(getHomepageHtml()); },
			'application/json': function() { res.json({ msg: 'hello' }); }
		});
	}
);
var homepageHtml = require('fs').readFileSync('./static/dashboard.html').toString();
function getHomepageHtml() { return homepageHtml; }
// Servers
server.use('/', express.static(__dirname + '/static'));
var usersServer = require('./lib/servers/users.js')(config, db);
server.use('/u',       usersServer);
server.use('/session', require('./lib/servers/session.js')(config, db));


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