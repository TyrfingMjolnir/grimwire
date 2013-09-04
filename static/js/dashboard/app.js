// Page state
var _session = null;
var _active_users = {};
var _peer_web = ['alice', // :DEBUG:
'bob',
'frank'];
function isPeer(user) {
	return _peer_web.indexOf(user.id) !== -1;
}

// APIs
var p2pwServiceAPI     = local.navigator('rel:http://grimwire.net:8000||self+grimwire.com/-service');
var p2pwOnlineUsersAPI = p2pwServiceAPI.follow({ rel: 'grimwire.com/-users', online: true });
var p2pwSessionAPI     = p2pwServiceAPI.follow({ rel: 'grimwire.com/-session' });

// Cache selectors
var $toolbar = $('#toolbar');
var $peerweb_review = $('#peerweb-review');
var $peerweb_edit = $('#peerweb-edit');

// Load session
p2pwSessionAPI.get({Accept:'application/json'}).then(setSession, gotoLogin);
function setSession(res) {
	_session = res.body;
	// &lceil;&bull;&bull;&middot;&middot;&middot;&rfloor;
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
}
function gotoLogin(res) {
	window.location = '/login.html';
}

// Load active users
function loadActiveUsers() {
	p2pwOnlineUsersAPI.get({Accept: 'application/json'})
		.then(function(res) {
			if (!res.body || !res.body.map) {
				return;
			}

			// Update state
			_active_users = res.body.map;

			// Udpate UI
			renderAll();
		});
}
loadActiveUsers();

// Logout link
$('#logout').on('click', function(e) {
	p2pwSessionAPI.delete()
		.then(gotoLogin, function() {
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
	console.log(_peer_web);
	$('textarea', $peerweb_edit).val(_peer_web.join('\n'));
	return false;
});

// Save peerweb link
$('#save-peerweb').on('click', function(e) {
	// Flip controls
	$peerweb_edit.hide();
	$peerweb_review.show();

	// Read input
	var userInput = $('textarea', $peerweb_edit).val();
	_peer_web = userInput.split(/[,\s]+/gm);

	renderAll();
	return false;
});

// Update UI state
function renderAll() {
	// Populate peer web
	$('.usernames', $peerweb_review).html(_peer_web.join('<br/>'));

	// Populate active users
	var html = '';
	for (var id in _active_users) {
		var user = _active_users[id];
		if (isPeer(user)) {
			var apps = '<a href=chat.grimwire.com target=_blank>chat.grimwire.com</a>'; // :TODO:
			html += '<a class="active-peer" href="#" data-content="'+apps+'">'+user.id+'</a> ';
		} else {
			html += '<span class="text-muted">'+user.id+'</span> ';
		}
	}
	$('#active-users').html(html);

	// Create popovers
	$('.active-peer').popover({
		html: true,
		placement: 'bottom'
	});
}
renderAll();

