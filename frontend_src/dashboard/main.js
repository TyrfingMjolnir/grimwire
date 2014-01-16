var common = require('./common');
var contentFrame = require('./content-frame');
var network = require('./network');
var dashboardGUI = require('./dashboard-gui');

// Setup
// =====

common.feedUA.POST('Welcome to Grimwire v0.6 <strong class="text-danger">unstable</strong> build. Please report any bugs or complaints to our <a href="https://github.com/grimwire/grimwire/issues" target="_blank">issue tracker</a>.', { Content_Type: 'text/html' });
common.feedUA.POST('<small class=text-muted>Early Beta Build. Not all behaviors are expected.</small>', {Content_Type: 'text/html'});
common.feedUA.POST('<div style="padding: 10px 0"><img src="/img/exclamation.png" style="position: relative; top: -2px"> <a href="httpl://explorer/intro" target="_content">Start here</a>.</div>', { Content_Type: 'text/html' });
contentFrame.dispatchRequest({ method: 'GET', url: /*window.location.hash.slice(1) || */'httpl://feed', target: '_content' });

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
local.addServer('feed', require('./feed'));
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