var http = require('http');
var https = require('https');
var express = require('express');
var winston = require('winston');
var fs = require('fs');

var middleware = require('./lib/middleware.js');
var html = require('./lib/html.js');

// Config
// ======
// Construct config from a combination of CLI, config.json, and defaults
var argv = require('optimist').argv;
var configDefaults = {
	hostname: require("os").hostname(),
	port: undefined,
	ssl: false,
	is_upstream: false,
	downstream_port: false,
	allow_signup: true
};
var configCLI = {
	hostname: argv.h || argv.hostname,
	port: argv.p || argv.port,
	ssl: argv.ssl,
	is_upstream: (typeof (argv.u || argv.is_upstream) != 'undefined') ? !!(argv.u || argv.is_upstream) : undefined,
	downstream_port: argv.u || argv.is_upstream,
	allow_signup: argv.allow_signup
};
var config = {};
function refreshConfig() {
	// Read config.json
	var configFile = {};
	try { configFile = JSON.parse(fs.readFileSync('./config.json')); } catch (e) {}

	// Merge config
	function merge(a, b) { return (typeof a != 'undefined') ? a : b; }
	for (var k in configDefaults) {
		config[k] = merge(configCLI[k], merge(configFile[k], configDefaults[k]));
	}
	if (typeof config.port == 'undefined') {
		config.port = (config.ssl) ? 443 : 80;
	}
}
refreshConfig();

// Construct service URL (note: only done at init, not on the reload signal, since reload doesn't update service info)
var urlPort = config.downstream_port || config.port;
if (config.ssl && urlPort == '443') urlPort = false;
if (!config.ssl && urlPort == '80') urlPort = false;
config.url = ((config.ssl) ? 'https://' : 'http://') + config.hostname + (urlPort ? (':' + urlPort) : '');

// Read HTML with config mixed in
html.load(config);

// Server State
// ============
var server = express();
var db = require('./lib/db')();
winston.add(winston.transports.File, { filename: 'relay.log', handleExceptions: false });


// Common Handlers
// ===============
server.use(express.bodyParser());
server.use(express.cookieParser());
if (config.is_upstream) {
	server.use(express.cookieSession({ proxy: true, secret: 'TODO -- INSERT SECRET TOKEN HERE', cookie: { httpOnly: true, secure: config.ssl } }));
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
		'</>; rel="self via service gwr.io/relay gwr.io/user"; title="Grimwire Relay"',
		'</u{?online,links}>; rel="collection gwr.io/relay gwr.io/user"; id="users"',
		'</u/{id}>; rel="item gwr.io/user"',
		'</u/{user}/s/{app}/{stream}{?nc}>; rel="item gwr.io/relay"',
		'</session>; rel="service gwr.io/session"; type="user"',
		'</session/{app}>; rel="service gwr.io/session"; type="app"',
		'</status>; rel="service"; id="status"'
	].join(', '));
	next();
});
server.head('/', function(req, res) { res.send(204); });
server.get('/',
	middleware.authenticate(config, db),
	function(req, res, next) {
		return res.format({
			'text/html': function() { res.send(require('./lib/html.js').dashboard); },
			'application/json': function() { res.json({ msg: 'hello' }); }
		});
	}
);
// Servers
server.use('/', express.static(__dirname + '/static'));
var usersServer = require('./lib/servers/users.js')(config, db);
server.use('/u',       usersServer);
server.use('/session', require('./lib/servers/session.js')(config, db));


// Admin
// =====
server.get('/status', function(request, response) {
	response.setHeader('Link', [
		'</>; rel="up via service gwr.io/relay gwr.io/user"; title="Grimwire Relay"',
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
process.on('SIGHUP', function() {
	winston.info('Received SIGHUP signal, reloading configuration.');
	refreshConfig();
	html.load(config);
	db.loadUsers();
});


// Setup
// =====
if (config.ssl && !config.is_upstream) {
	var sslOpts = {
		key: require('fs').readFileSync('ssl-key.pem'),
		cert: require('fs').readFileSync('ssl-cert.pem')
	};
	https.createServer(sslOpts, server).listen(config.port);
} else {
	server.listen(config.port);
}
server.startTime = new Date();
winston.info('Relay HTTP server listening on port '+config.port, config);


// PID management
// ==============
fs.writeFileSync('./pid', process.pid);
process.on('SIGINT', process.exit.bind(process, 0));
process.on('uncaughtException', process.exit.bind(process, 0));
process.on('exit', function() { fs.unlinkSync('./pid'); });