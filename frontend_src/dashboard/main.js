var common = require('./common');

// Page state
// ==========

var _session = null, _session_;
var _users = {};
var _session_user = null;

// APIs
var serviceURL = window.location.protocol+'//'+window.location.host;
var serviceUA = local.agent(serviceURL);
var usersUA   = serviceUA.follow({ rel: 'gwr.io/users', link_bodies: 1 });
var sessionUA = serviceUA.follow({ rel: 'gwr.io/session', type: 'user' });
var feedUA = local.agent('httpl://feed');

// Setup
// =====

feedUA.POST('Welcome to Grimwire v0.6. Please report any bugs or complaints to our <a href="https://github.com/grimwire/grimwire/issues" target="_blank">issue tracker</a>.', { Content_Type: 'text/html' });
common.dispatchRequest({ method: 'GET', url: /*window.location.hash.slice(1) || */'feed', target: '_content' });

// So PouchDB can target locals
// local.patchXHR();
Pouch.adapter('httpl', Pouch.adapters['http']);

// Traffic logging
local.setDispatchWrapper(function(req, res, dispatch) {
	dispatch(req, res).then(
		function() { console.log(req, res); },
		function() { console.error(req, res); }
	);
});

// Servers
local.addServer('href', require('./href'));
local.addServer('explorer', require('./explorer'));
local.addServer('feed', require('./feed'));
local.addServer('workers', require('./workers'));
local.addServer(window.location.host, function(req, res) {
	var req2 = new local.Request({
		method: req.method,
		url: serviceURL+req.path,
		headers: local.util.deepClone(req.headers),
		stream: true
	});
	local.pipe(res, local.dispatch(req2));
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
});

// Dropdown behaviors
$('.dropdown > a').on('click', function() { $(this).parent().toggleClass('open'); return false; });
$('body').on('click', function() { $('.dropdown').removeClass('open'); });

// Collapsible panels
$(document).ready(function () {
	$('body').layout({ west__size: 800, west__initClosed: true, east__size: 300, east__initClosed: true,  });
});

// Request events
local.bindRequestEvents(document.body);
document.body.addEventListener('request', function(e) {
	common.dispatchRequest(e.detail, e.target);
});


// Backend Interop
// ===============

// Load session
_session_ = sessionUA.get({ Accept: 'application/json' });
_session_.then(setSession);
function setSession(res) {
	// Update state
	_session = res.body;
	if (_users[_session.user_id]) {
		_session_user = _users[_session.user_id];
	}

	// Update UI
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}

// Load active users
function loadActiveUsers() {
	usersUA.get({ Accept: 'application/json' })
		.then(
			function(res) {
				_users = res.body.rows;
				if (_session && _users[_session.user_id]) {
					_session_user = _users[_session.user_id];
				}
				renderAll();
			},
			handleFailedRequest
		);
	return false;
	// ^ loadActiveUsers() is sometimes used as a DOM event handler
}
loadActiveUsers();

// Refresh users on tab focus
(function() {
	var lastRefresh = Date.now();
	window.onfocus = function() {
		if (Date.now() - lastRefresh > 60000) {
			loadActiveUsers();
			lastRefresh = Date.now();
		}
	};
})();

// Standard request error handler for our host
function handleFailedRequest(res) {
	if (res.status == 401) {
		// session lost
		alert('Your session has expired, redirecting you to the login page.');
		window.location.reload();
	}
}


// UI Behaviors
// ============

// Cache selectors and templates
var $active_links = $('#active-links');
var $your_connections = $('#your-connections');
var renderYourConnections = Handlebars.compile($('#your-connections-tmpl').html());

// Change email link
$('#change-email').on('click', function() {
	if (!_session_user) return false;

	var new_email = prompt('Your current address is '+(_session_user.email?_session_user.email:'not set')+'. Update your address to:');
	if (!new_email) return false;

	// Update or setup update process depending on whether this is the first time
	var userUA = usersUA.follow({ rel: 'gwr.io/user', id: _session.user_id });
	if (!_session_user.email) {
		userUA.PATCH({ email: new_email })
			.then(function() { _session_user.email = new_email; alert('Your email has been updated to '+new_email); })
			.fail(function(res) {
				if (res.status == 422) return alert('Invalid email address. Please check your adress and try again.');
				alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason);
			});
	} else {
		userUA.follow({ rel: 'gwr.io/confirmed-update' }).POST({ email: new_email })
			.then(function() { _session_user.email = new_email; alert('An email has been sent to your old address to confirm the update to '+new_email); })
			.fail(function(res) {
				if (res.status == 422) return alert('Invalid email address. Please check your adress and try again.');
				alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason);
			});
	}
	return false;
});

// Change password link
$('#change-pw').on('click', function() {
	if (!_session_user) return false;
	if (!_session_user.email) {
		alert('Password updates require an email account to confirm identity. Please use the "Change Email" to set this first.');
		return false;
	}
	if (!confirm('For security purposes, a confirmation email will be sent to '+_session_user.email+' with an update link. Send the email?')) {
		return false;
	}
	usersUA.follow({ rel: 'gwr.io/user', id: _session.user_id })
		.follow({ rel: 'gwr.io/confirmed-update' })
		.POST({ password: true })
		.then(function() { alert('Check your inbox for the confirmation link.'); })
		.fail(function(res) { alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason); });
	return false;
});

// Logout link
$('#logout').on('click', function(e) {
	sessionUA.delete()
		.then(window.location.reload.bind(window.location), function() {
			console.warn('Failed to delete session');
		});
	return false;
});

// Refresh button
$('.refresh').on('click', loadActiveUsers);

// Guest slot +/- buttons
var _updateGuestStreamsReq = null;
var _updateGuestBufferingTimeout = null;
function updateGuestSlotsCB(d_streams) {
	return function() {
		if (_session_user) {
			// Find the target
			var target = _session_user.max_guest_streams + d_streams;
			if (target < _session_user.num_guest_streams) return false;
			if (target > (_session_user.max_user_streams - _session_user.num_user_streams)) return false;
			_session_user.max_guest_streams = target;

			// Cancel any requests in progress
			if (_updateGuestStreamsReq) {
				_updateGuestStreamsReq.close();
			}
			if (_updateGuestBufferingTimeout) {
				clearTimeout(_updateGuestBufferingTimeout);
			}

			renderUserConnections();
			_updateGuestBufferingTimeout = setTimeout(function() {
				// Create the request
				_updateGuestStreamsReq = new local.Request({
					method: 'PATCH',
					headers: { 'content-type': 'application/json' }
				});
				usersUA.follow({ rel: 'item', id: _session.user_id })
					.dispatch(_updateGuestStreamsReq)
					.then(renderUserConnections);
				_updateGuestStreamsReq.end({ max_guest_streams: target });
			}, 250);
		}
		return false;
	};
}


// Avatars
// =======

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
	usersUA.follow({ rel: 'item', id: _session.user_id }).patch({ avatar: avatar });
	_session.avatar = avatar;

	return false;
});


// Rendering Helpers
// =================

function renderLinkRow(link) {
	var urld = local.parseUri(link.href);
	var peerd = local.parsePeerDomain(urld.authority);
	var appUrl = peerd ? peerd.app : urld.authority;
	return '<tr><td>'+(link.title||link.href)+'<a class="pull-right" href="http://'+appUrl+'" target="_blank">'+appUrl+'</a></td></tr>';
}
function renderLinks(userId) {
	return (_users[userId]) ? _users[userId].links.map(renderLinkRow).join('') : '';
}

// Update connections view
function renderUserConnections() {
	if (_session_user) {
		// Render active connections
		var max_guest_streams = Math.min(_session_user.max_user_streams - _session_user.num_user_streams, _session_user.max_guest_streams);
		html = renderYourConnections({
			num_user_streams: _session_user.num_user_streams,
			max_user_streams: _session_user.max_user_streams,
			num_guest_streams: _session_user.num_guest_streams,
			max_guest_streams: _session_user.max_guest_streams,
			pct_user_streams: Math.round((_session_user.num_user_streams / _session_user.max_user_streams) * 100),
			pct_guest_streams: Math.round((_session_user.num_guest_streams / _session_user.max_user_streams) * 100),
			pct_guest_remaining: Math.round(((max_guest_streams - _session_user.num_guest_streams) / _session_user.max_user_streams) * 100)
		});
		$your_connections.html(html);

		// Bind guest slot add/remove btns
		$('#remove-guest-slot').on('click', updateGuestSlotsCB(-1));
		$('#add-guest-slot').on('click', updateGuestSlotsCB(+1));
	} else {
		$your_connections.html('');
	}
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
				html += ' <small>offline</small></h4>';
			} else {
				html += '</h4>';
				html += '<table id="'+user.id+'-links" class="table table-hover table-condensed">' + renderLinks(user.id) + '</table>';
			}
		}

		// Render
		$active_links.html(html);
	} else {
		$active_links.html('');
	}

	renderUserConnections();
}
renderAll();