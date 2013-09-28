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
var p2pwServiceAPI = local.navigator('nav:||//'+window.location.host+'|self+grimwire.com/-p2pw/service');
var p2pwUsersAPI   = p2pwServiceAPI.follow({ rel: 'grimwire.com/-user collection' });
var p2pwSessionAPI = p2pwServiceAPI.follow({ rel: 'grimwire.com/-session' });

// Load session
_session_ = p2pwSessionAPI.get({Accept:'application/json'});
_session_.then(setSession);
function setSession(res) {
	// Store state
	_session = res.body;

	// Update UI
	// &lceil;&bull;&bull;&middot;&middot;&middot;&rfloor;
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}
function refreshPage() {
	window.location.reload();
}

// Load active users
function loadActiveUsers() {
	p2pwUsersAPI.get({ accept: 'application/json' })
		.then(function(res) {
			if (!res.body || !res.body.rows) {
				return;
			}

			// Update state
			_users = res.body.rows;
			fetchFriendLinks();

			// Udpate UI
			renderAll();
		}, handleFailedRequest);
	return false;
}
loadActiveUsers();

// Request error handling
function handleFailedRequest(res) {
	if (res.status == 401) {
		// session lost
		alert('Your session has expired, redirecting you to the login page.');
		refreshPage();
	}
}

// Updates link cache of peers
function fetchFriendLinks() {
	if (!_session) { return; }

	_session.friends.forEach(function(userId) {
		var user = _users[userId];
		if (user && user.online && (window.location.hostname in user.streams)) {
			// Build domain of their instance of the grimwire dashboard app
			var relayDomain = local.makePeerDomain(userId, window.location.hostname, window.location.hostname, 0);
			// Fetch just their links
			local.dispatch({
				method: 'HEAD',
				url: 'nav:||httpl://'+relayDomain+'|grimwire.com/-index,user='+userId
			}).then(function(res) {
				// Update friends' links
				_friend_links[userId] = res.parsedHeaders.link.filter(function(link) {
					// Exclude any dashboard links
					return link.app != window.location.hostname;
				});

				// Update UI
				$('#'+userId+'-links').html(renderFriendLinks(userId));
			}, console.error.bind(console, 'Failed to read links for '+userId));
		}
	});
}