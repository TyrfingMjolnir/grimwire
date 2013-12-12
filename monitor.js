var mailer = require('./lib/email');
var argv = require('optimist').argv;
var host = argv.h || argv.host || 'http://localhost:8000/';
var interval = argv.i || argv.interval || 15;
var email = process.argv[3];
var loadavg = process.argv[4] || 0.75;
var memfree = process.argv[5] || 15;

if (!email) {
	console.log('Email required.');
	console.log('  Usage: grimwire monitor <email> [loadavg (pct)] [memfree (MB)]');
	console.log('    eg ./grimwire monitor bob@foo.com 0.65 30');
	console.log('  Defaults: loadavg=0.75, memfree=15');
	console.log('  Flags:');
	console.log('   -h/--host [hostname] (the relay service to track)');
	console.log('   -i/--interval [v] (default 15, how frequently to check, in seconds)');
	return;
}

var url = require('url').resolve(host, 'status');
var firstTry = true;
function fetch() {
	var transport = (url.indexOf('https') === 0) ? require('https') : require('http');
	transport.get(url, function(res) {
		if (res.statusCode != 200) {
			return handleRequestError(res.statusCode + ' ' + res.reasonPhrase);
		}

		res.setEncoding('utf8');
		var body = '';
		res.on('data', function (chunk) { body += chunk; });
		res.on('end', function() {
			try { body = JSON.parse(body); }
			catch (e) { handleRequestError(e); }

			reviewStatus(body);
		});

		firstTry = false;
	}).on('error', handleRequestError);
}
setInterval(fetch, interval*1000);
fetch();

function handleRequestError(e) {
	if (firstTry) {
		// Probably bad config
		console.error('Failed to fetch status at '+url, e);
		process.exit(2);
	} else {
		// Host down
	}
}

var lastAlerts = {};
function reviewStatus(body) {
	// Look for alert conditions
	var alerts = {};
	if (loadavg && body.loadavg > loadavg) {
		alerts.loadavg = body.loadavg;
	}
	if (memfree && body.memfree_mb < memfree) {
		alerts.memfree = body.memfree_mb;
	}

	// Alerts present?
	if (Object.keys(alerts).length > 0) {
		// See whats new
		var newAlerts = {};
		for (var k in alerts) {
			if (k in lastAlerts) {
				continue;
			}
			newAlerts[k] = alerts[k];
		}
		if (Object.keys(newAlerts).length > 0) {
			// New alerts!
			mail('Alert: '+host+' has '+JSON.stringify(newAlerts), newAlerts);
		}
	} else {
		if (Object.keys(lastAlerts).length > 0) {
			// All clear!
			mail('Resolved: '+host+' has returned to normal usage levels');
		}
	}
	lastAlerts = alerts;
}

function mail(status) {
	mailer.sendMail({
		from: 'noreply@'+require("os").hostname(),
		to: email,
		subject: status
	}, function(err, response) {
		if (err) {
			console.error('Failed to send alert email', err, response);
			console.error('Was going to send: '+status);
			process.exit(3);
		}
	});
}