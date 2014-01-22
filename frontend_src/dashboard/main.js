var common = require('./common');
var contentFrame = require('./content-frame');
var network = require('./network');
var dashboardGUI = require('./dashboard-gui');

// Setup
// =====

$('main iframe').one('load', function() { // wait till iframe is ready to be updated
	// Banner
	common.cliUA.POST('<img src="/img/avatars/user_astronaut.png"> "Welcome to Grimwire. We fight for the user."', { Content_Type: 'text/html', From: 'httpl://feed' });
	common.cliUA.POST([
		'<strong>Grimwire v0.6.0 <span class="text-danger">unstable</span> build.</strong>',
		'<small class="text-muted">Early Beta Build. Not all behaviors',
		'are expected.</small>'
	].join('\n'), { Content_Type: 'text/html', From: 'httpl://feed' });
	common.cliUA.POST([
		' <img src="/img/fatcow/16x16/blackboard_drawing.png"> <a href="httpl://explorer/intro" target="_content">Start here</a>.',
		' <img src="/img/fatcow/16x16/bug.png"> Please report bugs to the <a href="https://github.com/grimwire/grimwire/issues" target="_blank">issue tracker</a>.'
	].join('\n'), { Content_Type: 'text/html', From: 'httpl://feed' });
});

// So PouchDB can target locals
// local.patchXHR();
// Pouch.adapter('httpl', Pouch.adapters['http']);

// Traffic logging
local.setDispatchWrapper(function(req, res, dispatch) {
	var res_ = dispatch(req, res);
	res_.then(
		function() { console.log(req, res); },
		function() { console.error(req, res); }
	);
});

// Servers
var workers_server = require('./workers');
// local.addServer('href', require('./href'));
local.addServer('storage', require('./storage'));
local.addServer('explorer', require('./explorer'));
local.addServer('cli', require('./cli'));
local.addServer('workers', workers_server);
local.addServer(window.location.host, network.hostProxy);
local.removeServer('hosts'); // replace hosts service
local.addServer('hosts', require('./hosts'));

// Request events
local.bindRequestEvents(document.body);
document.body.addEventListener('request', function(e) {
	var req = e.detail;
	contentFrame.dispatchRequest(req, e.target);
});

// Network relay
var relay = local.joinRelay(common.serviceURL);
network.setupRelay(common.serviceURL, relay);

// GUI
dashboardGUI.setup();
contentFrame.setupChromeUI();
common.layout = $('body').layout({ west__size: 800, west__initClosed: true, east__size: 300, east__initClosed: true });

// Init
(function() {
	var firstreq = { method: 'GET', url: window.location.hash.slice(1) || 'httpl://cli', target: '_content' };
	if (firstreq.url.indexOf('@') !== -1) {
		// Global URI, wait for network
		network.relay.once('listening', function() { console.log('going for it'); contentFrame.dispatchRequest(firstreq); });
	} else if (firstreq.url.indexOf('.js') !== -1) {
		// Worker, allow to setup
		setTimeout(function() {
			contentFrame.dispatchRequest(firstreq);
		}, 5);
	} else {
		contentFrame.dispatchRequest(firstreq);
	}
})();

