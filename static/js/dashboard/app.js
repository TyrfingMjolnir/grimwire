// Page state
// ==========

var _session = {trusted_peers:[]};
var _users = [];
function isPeer(user) {
	if (!_session) return false;
	return _session.user_id == user.id || _session.trusted_peers.indexOf(user.id) !== -1;
}


// Backend Interop
// ===============

// APIs
var p2pwServiceAPI = local.navigator('rel:http://grimwire.net:8000||self+grimwire.com/-p2pw/service');
var p2pwUsersAPI   = p2pwServiceAPI.follow({ rel: 'grimwire.com/-user collection' });
var p2pwSessionAPI = p2pwServiceAPI.follow({ rel: 'grimwire.com/-session' });

// Load session
p2pwSessionAPI.get({Accept:'application/json'}).then(setSession);
function setSession(res) {
	// Store state
	_session = res.body;

	// Update UI
	// &lceil;&bull;&bull;&middot;&middot;&middot;&rfloor;
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}
function refreshPage(res) {
	window.location.href = window.location.href;
	window.location.reload();
}

// Load active users
function loadActiveUsers() {
	p2pwUsersAPI.get({Accept: 'application/json'})
		.then(function(res) {
			if (!res.body || !res.body.rows) {
				return;
			}

			// Update state
			_users = res.body.rows;

			// Udpate UI
			renderAll();
		});
	return false;
}
loadActiveUsers();

// Update trusted peers
function syncTrustedPeers(users) {
	p2pwUsersAPI.follow({ rel: 'grimwire.com/-user item', id: _session.user_id })
		.patch({ trusted_peers: users })
		.fail(function(res) {
			console.warn('Failed to update trusted users', res);
		});
}


// UI
// ==

// Cache selectors
var $toolbar = $('#toolbar');
var $peerweb_review = $('#peerweb-review');
var $peerweb_edit = $('#peerweb-edit');

// Logout link
$('#logout').on('click', function(e) {
	p2pwSessionAPI.delete()
		.then(refreshPage, function() {
			console.warn('Failed to delete session');
		});
	return false;
});

// Refresh link
$('#refresh').on('click', loadActiveUsers);

// Edit peerweb link
$('#edit-peerweb').on('click', function(e) {
	// Flip controls
	$peerweb_review.hide();
	$peerweb_edit.show();

	// Populate editor
	$('textarea', $peerweb_edit).val(_session.trusted_peers.join('\n'));
	return false;
});

// Save peerweb link
$('#save-peerweb').on('click', function(e) {
	// Flip controls
	$peerweb_edit.hide();
	$peerweb_review.show();

	// Read input
	var userInput = $('textarea', $peerweb_edit).val();
	_session.trusted_peers = userInput.split(/[,\s]+/gm);
	syncTrustedPeers(_session.trusted_peers);

	renderAll();
	return false;
});

// Update UI state
function renderAll() {
	// Populate peer web
	$('.usernames', $peerweb_review).html(_session.trusted_peers.join('<br/>'));

	// Populate active users
	var html = '';
	for (var i=0; i < _users.length; i++) {
		var user = _users[i];
		if (user.online) {
			if (user.trusts_this_session) {
				var apps = '';
				for (var app in user.streams) {
					apps += '<a href=//'+app+' target=_blank>'+app+'</a><br/>';
				}
				html += '<a class="active-peer" href="#" data-content="'+apps+'">'+user.id+'</a> ';
			} else {
				html += user.id+' ';
			}
		} else {
			html += '<span class="text-muted">'+user.id+'</span> ';
		}
	}
	if (!html) { html = '<span class="text-muted">No users online.</span>'; }
	$('#active-users').html(html);

	// Create popovers
	$('.active-peer').popover({
		html: true,
		placement: 'bottom'
	});
}
renderAll();

