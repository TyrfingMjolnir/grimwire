// UI
// ==

// Cache selectors
var $user_and_friends = $('#user-and-friends');
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

// Add friend button
$('.add-friend').on('click', function(e) {
	var friend = prompt('User to add to your friends:');
	if (friend && _session.friends.indexOf(friend) === -1) {
		// Update the user
		_session.friends.push(friend);
		usersAPI.follow({ rel: 'item', id: _session.user_id })
			.patch({ friends: _session.friends });

		// Update UI
		renderAll();

		// Update index
		fetchFriendLinks();
	}
});

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
	session.avatar = avatar;

	return false;
});

// Rendering helpers
function renderLinkRow(link) {
	var app = link.app;
	if (!app) {
		var peerd = local.parsePeerDomain(local.parseUri(link.href).authority);
		app = peerd.app;
	}
	return '<tr><td>'+(link.title||link.href)+'<a class="pull-right" href="//'+app+'" target="_blank">'+app+'</a></td></tr>';
}
function renderUserLinks() {
	var html = '';
	for (var domain in _user_links) {
		html += _user_links[domain].map(renderLinkRow).join('');
	}
	return html;
}
function renderFriendLinks(userId) {
	return (_friend_links[userId]) ? _friend_links[userId].map(renderLinkRow).join('') : '';
}

// Update UI state
function renderAll() {
	var html;

	if (_session && Object.keys(_users).length > 0) {
		// Set active avatar
		$('.avatars a[data-avatar="'+_session.avatar+'"]').addClass('selected');

		// Session user
		html = '<h3><img class="user-avatar" src="/img/avatars/'+_session.avatar+'" /> '+_session.user_id+' <small>this is you!</small></h3>';
		html += '<table id="'+_session.user_id+'-links" class="table table-hover table-condensed">'+renderUserLinks()+'</table>';

		// Friends
		_session.friends.forEach(function(friendId) {
			var friend = _users[friendId];
			if (!friend) { return; }
			html += '<h4><img src="/img/avatars/'+friend.avatar+'" /> '+friendId;
			html += ' <small><a class="remove-friend" data-user="'+friendId+'" href="javascript:void(0)" title="Remove friend">&times;</a>';
			if (!friend.online) {
				html += ' offline</small></h4>';
			} else {
				html += '</small></h4>';
				html += '<table id="'+friendId+'-links" class="table table-hover table-condensed">' + renderFriendLinks(friendId) + '</table>';
			}
		});

		// Render
		$user_and_friends.html(html);
	} else {
		$user_and_friends.html('');
	}

	// Populate active users
	html = '';
	for (var id in _users) {
		var user = _users[id];
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
	$active_users.html(html);

	// Create popovers
	$('.active-peer').popover({
		html: true,
		placement: 'bottom'
	});

	// Remove friend button
	$('.remove-friend').on('click', function(e) {
		var userId = $(this).data('user');
		if (userId && _session.friends.indexOf(userId) !== -1) {
			// Update the user
			_session.friends.splice(_session.friends.indexOf(userId), 1);
			usersAPI.follow({ rel: 'item', id: _session.user_id })
				.patch({ friends: _session.friends });

			// Update UI
			renderAll();
		}
	});
}
renderAll();