// Page state
// ==========
var _session = null, _session_;
var _users = {};


// Backend Interop
// ===============

// APIs
var serviceAPI = local.agent('nav:||//'+window.location.host+'|self+service+gwr.io/relay');
var usersAPI   = serviceAPI.follow({ rel: 'gwr.io/user collection', links: 1 });
var sessionAPI = serviceAPI.follow({ rel: 'gwr.io/session', type: 'user' });

// Load session
_session_ = sessionAPI.get({ accept: 'application/json' });
_session_.then(setSession);
function setSession(res) {
	// Update state
	_session = res.body;

	// Update UI
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}

// Load active users
function loadActiveUsers() {
	usersAPI.get({ accept: 'application/json' })
		.then(
			function(res) {
				_users = res.body.rows;
				// Extract links for each user
				for (var id in _users) {
					_users[id].links = local.queryLinks(res, { host_user: id });
				}
				renderAll();
			},
			handleFailedRequest
		);
	return false;
	// ^ loadActiveUsers() is sometimes used as a DOM event handler
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

// UI
// ==

// Cache selectors
var $active_links = $('#active-links');
var $active_users = $('#active-users');

// Logout link
$('#logout').on('click', function(e) {
	sessionAPI.delete()
		.then(window.location.reload.bind(window.location), function() {
			console.warn('Failed to delete session');
		});
	return false;
});

// Refresh button
$('.refresh').on('click', loadActiveUsers);


// Avatars
(function() {
	var arr=[];
	var nAvatars = _avatars.length;
	$('.avatars').html(
		_avatars.sort().map(function(avatar, i) {
			// Add the avatar to the array
			arr.push('<a href="javascript:void(0)" data-avatar="'+avatar+'"><img src="/img/avatars/'+avatar+'" title="'+avatar+'" /></a>');
			// Flush the array on every 8th (or the last)
			if (arr.length === 8 || i === nAvatars-1) {
				var str = '<li>'+arr.join('')+'</li>';
				arr.length = 0;
				return str;
			}
			return '';
		}).join('')
	);
})();
$('.avatars a').on('click', function() {
	var avatar = $(this).data('avatar');

	// Update UI
	$('.avatars a.selected').removeClass('selected');
	$(this).addClass('selected');
	$('.user-avatar').attr('src', '/img/avatars/'+avatar);

	// Update the user
	usersAPI.follow({ rel: 'item', id: _session.user_id })
		.patch({ avatar: avatar });
	_session.avatar = avatar;

	return false;
});

// Rendering helpers
function renderLinkRow(link) {
	var app = link.host_app;
	return '<tr><td>'+(link.title||link.href)+'<a class="pull-right" href="http://'+app+'" target="_blank">'+app+'</a></td></tr>';
}
function renderLinks(userId) {
	return (_users[userId]) ? local.queryLinks(_users[userId].links, { rel: 'gwr.io/app' }).map(renderLinkRow).join('') : '';
}

// Update UI state
function renderAll() {
	var html;

	if (_session && Object.keys(_users).length > 0) {
		// Set active avatar
		$('.avatars a[data-avatar="'+_session.avatar+'"]').addClass('selected');

		// Session user
		html = '<h3><img class="user-avatar" src="/img/avatars/'+_session.avatar+'" /> '+_session.user_id+' <small>this is you!</small></h3>';
		html += '<table id="'+_session.user_id+'-links" class="table table-hover table-condensed">'+renderLinks(_session.user_id)+'</table>';

		// Other users
		for (var id in _users) {
			var user = _users[id];
			if (user.id == _session.user_id) { continue; }
			html += '<h4><img src="/img/avatars/'+user.avatar+'" /> '+user.id;
			if (!user.online) {
				html += ' offline</small></h4>';
			} else {
				html += '</small></h4>';
				html += '<table id="'+user.id+'-links" class="table table-hover table-condensed">' + renderLinks(user.id) + '</table>';
			}
		}

		// Render
		$active_links.html(html);
	} else {
		$active_links.html('');
	}

	// Populate active users
	html = '';
	for (var id in _users) {
		var user = _users[id];
		if (user.online) {
			var apps = [];
			for (var i=0; i < user.links.length; i++) {
				if (apps.indexOf(user.links[i].host_app) == -1)
					apps.push(user.links[i].host_app);
			}
			apps = apps.map(function(app) { return '<a href=http://'+app+' target=_blank>'+app+'</a><br/>'; }).join(''); // no quotes on link attrs -- messes with data-content
			html += '<a class="active-peer" href="#" data-content="'+apps+'">'+user.id+'</a> ';
		} else {
			html += '<span class="text-muted">'+user.id+'</span> ';
		}
	}
	if (!html) { html = '<span class="text-muted">No users online.</span>'; }
	$active_users.html(html);

	// Create popovers
	$('.active-peer').popover({
		html: true,
		placement: 'bottom'
	});
}
renderAll();