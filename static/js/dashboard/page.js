// Page state
// ==========
var _session = null, _session_;
var _users = {};
var _user_links = {}; // peer domain -> [links]
var _friend_links = {}; // friend id -> [links]
var _peerRelay = null;


// Backend Interop
// ===============

// APIs
var serviceAPI = local.navigator('nav:||//'+window.location.host+'|self+grimwire.com/-p2pw/service');
var usersAPI   = serviceAPI.follow({ rel: 'grimwire.com/-user collection' });
var sessionAPI = serviceAPI.follow({ rel: 'grimwire.com/-session' });

// Load session
_session_ = sessionAPI.get({ accept: 'application/json' });
_session_.then(setSession);
function setSession(res) {
	// Update state
	_session = res.body;
	fetchUserLinks();
	fetchFriendLinks();

	// Update UI
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}

// Load active users
function loadActiveUsers() {
	usersAPI.get({ accept: 'application/json' })
		.then(function(res) {
			// Update state
			_users = res.body.rows;
			fetchUserLinks();
			fetchFriendLinks();

			// Udpate UI
			renderAll();
		}, handleFailedRequest);
	return false; // loadActiveUsers() is sometimes used as a DOM event handler
}
loadActiveUsers();

// Users refresh on tab focus
(function() {
	var lastRefresh = Date.now();
	window.onfocus = function() {
		if (Date.now() - lastRefresh > 60000) {
			loadActiveUsers();
			lastRefresh = Date.now();
		}
	};
})();

// Request error handling
function handleFailedRequest(res) {
	if (res.status == 401) {
		// session lost
		alert('Your session has expired, redirecting you to the login page.');
		window.location.reload();
	}
}

// Updates link cache of session user's apps
function fetchUserLinks() {
	if (!_session || !_users[_session.user_id]) { return; }

	var user = _users[_session.user_id];
	var hostname = window.location.hostname;
	_user_links = {}; // reset the map
	for (var appDomain in user.streams) {
		user.streams[appDomain].forEach(function(streamId) {
			// Build domain
			var domain = _peerRelay.makeDomain(_session.user_id, appDomain, streamId);

			// Fetch app links
			local.dispatch({ method: 'HEAD', url: 'httpl://'+domain }).then(function(res) {
				// Update linkmap
				_user_links[domain] = res.parsedHeaders.link;

				// Update UI
				$('#'+_session.user_id+'-links').html(renderUserLinks());
			}, console.error.bind(console, 'Failed to read links for '+domain));
		});
	}
}

// Updates link cache of peers
function fetchFriendLinks() {
	if (!_session) { return; }

	_session.friends.forEach(function(userId) {
		var hostname = window.location.hostname;
		var user = _users[userId];
		if (user && user.online && (window.location.hostname in user.streams)) {
			// Build domain of their instance of the grimwire dashboard app
			var relayDomain = local.makePeerDomain(userId, hostname, hostname, 0);

			// Fetch their links
			local.dispatch({
				method: 'HEAD',
				url: 'nav:||httpl://'+relayDomain+'|grimwire.com/-index'
			}).then(function(res) {
				// Update linkmap
				_friend_links[userId] = res.parsedHeaders.link.filter(function(link) {
					return link.app != hostname; // we only want non-dashboard links
				});

				// Update UI
				$('#'+userId+'-links').html(renderFriendLinks(userId));
			}, console.error.bind(console, 'Failed to read links for '+userId));
		}
	});
}