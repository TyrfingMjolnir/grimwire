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
var config = require('./lib/config');
var configDefaults = {
	hostname: require("os").hostname(),
	port: undefined,
	ssl: false,
	is_upstream: false,
	downstream_port: false,
	allow_signup: true,
	max_user_streams: 10,
	max_accounts: 100
};
var configCLI = {
	hostname: argv.h || argv.hostname,
	port: argv.p || argv.port,
	ssl: argv.ssl,
	is_upstream: (typeof (argv.u || argv.is_upstream) != 'undefined') ? !!(argv.u || argv.is_upstream) : undefined,
	downstream_port: argv.u || argv.is_upstream,
	allow_signup: argv.allow_signup,
	max_user_streams: argv.max_user_streams,
	max_accounts: argv.max_accounts
};
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
		config.port = (config.ssl) ? 443 : 8000;
	}
}
refreshConfig();

// Construct service URL (note: only done at init, not on the reload signal, since reload doesn't update service info)
var urlPort = config.downstream_port || config.port;
if (config.ssl && urlPort == '443') urlPort = false;
if (!config.ssl && urlPort == '80') urlPort = false;
config.authority = config.hostname + (urlPort ? (':' + urlPort) : '');
config.url = ((config.ssl) ? 'https://' : 'http://') + config.authority;

// Read HTML with config mixed in
html.load(config);

// Server State
// ============
var server = express();
var db = require('./lib/db');
winston.add(winston.transports.File, { filename: 'relay.log', handleExceptions: false });
db.loadUsers();


// Common Handlers
// ===============
server.use(express.bodyParser());
server.use(express.cookieParser());
server.use(express.compress());
if (config.is_upstream) {
	server.use(express.cookieSession({ proxy: true, secret: 'TODO -- INSERT SECRET TOKEN HERE', cookie: { httpOnly: true, secure: config.ssl } }));
} else {
	server.use(express.cookieSession({ secret: 'TODO -- INSERT SECRET TOKEN HERE', cookie: { httpOnly: true, secure: config.ssl } }));
}
if (config.ssl) {
	server.use(function(req, res, next) {
		res.setHeader('Strict-Transport-Security', 'max-age=8640000; includeSubDomains');
		next();
	});
}
server.all('*', middleware.setCorsHeaders);
server.options('*', function(req, res) {
	res.writeHead(204);
	res.end();
});


// Server definition
// =================
server.all('/', function(req, res, next) {
	res.setHeader('Link', [
		'</>; rel="self via service gwr.io/grimwire"; title="'+config.hostname+'"',
		'</u{?online,links,link_bodies}>; rel="collection gwr.io/relays gwr.io/users"; id="users"; title="Users"; hidden',
		'</u?index=users&online=1>; rel="collection gwr.io/relays gwr.io/users"; title="Online Users"; online',
		'</u?index=programs>; rel="collection gwr.io/relays gwr.io/users"; title="Online Programs"; online',
		'</u?index=users>; rel="collection gwr.io/relays gwr.io/users"; title="User Directory"; index=users',
		'</u/{id}>; rel="gwr.io/user"; title="User by ID"',
		'</u/{user}/s/{app}/{sid}{?nc}>; rel="gwr.io/relay"; title="Relay Stream by User, App and SID"; hidden',
		'</session>; rel="gwr.io/session"; type="user"; title="Sessions Service"; hidden',
		'</session/{app}>; rel="gwr.io/session"; type="app"; title="3rd-party App Sessions Service"; hidden',
		'</session/{app}?guestof={hostuser}>; rel="gwr.io/session"; type="guest"; title="Guest Sessions Service"; hidden',
		'</status>; rel="service"; id="status"; title="Network Host Stats"; hidden'
	].join(', '));
	next();
});
server.head('/', function(req, res) { res.send(204); });
server.get('/',
	middleware.authenticate,
	function(req, res, next) {
		return res.format({
			'text/html': function() {
				res.set('Content-Security-Policy', "default-src 'self'; img-src *; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-src *; connect-src *");
				res.send(require('./lib/html.js').dashboard);
			},
			'application/json': function() { res.json({ msg: 'hello' }); }
		});
	}
);
// Servers
server.use('/', express.static(__dirname + '/static', { maxAge: 1000*60*60*24 }));
var usersServer = require('./lib/servers/users.js')();
server.use('/u', usersServer);
server.use('/session', require('./lib/servers/session.js')());


// Admin
// =====
server.get('/status', function(req, res) {
	res.setHeader('Link', [
		'</>; rel="up via service gwr.io/grimwire"; title="'+config.hostname+'"',
		'</status>; rel="self service"; id="status"; title="Network Host Stats"'
	].join(', '));
	var uptime = (new Date() - server.startTime);
	var stats = require('./lib/metrics').toJSON();
	stats.started_at = server.startTime.toLocaleString();
	stats.uptime_hours = uptime/(60*60*1000);
	stats.uptime_days = uptime/(24*60*60*1000);
	res.json(stats);
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
process.on('uncaughtException', function(e) {
    console.error(e);
    process.exit(0);
});
process.on('exit', function() { fs.unlinkSync('./pid'); });