// Page state
// ==========

var host = window.location.host;
var _session = {};
var _users = [];


// Backend Interop
// ===============

// APIs
var p2pwServiceAPI = local.navigator('rel://'+host+'||self+grimwire.com/-p2pw/service');
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


// UI
// ==

// Cache selectors
var $toolbar = $('#toolbar');

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

// Update UI state
function renderAll() {
	// Populate active users
	var html = '';
	for (var i=0; i < _users.length; i++) {
		var user = _users[i];
		if (user.online) {
			var apps = '';
			for (var app in user.streams) {
				apps += '<a href=//'+app+' target=_blank>'+app+'</a><br/>';
			}
			html += '<a class="active-peer" href="#" data-content="'+apps+'">'+user.id+'</a> ';
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

