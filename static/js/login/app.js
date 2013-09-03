var sessionAPI = local.navigator(['//grimwire.net:8000', { rel: 'service', id: 'session' }]);
sessionAPI.resolve();

$('.form-login').on('submit', function(e) {
	var creds = $('.form-login').serializeArray();
	sessionAPI.post({ id: creds[0].value, password: creds[1].value })
		.then(function(res) {
			// Success, redirect to dashboard
			window.location = '/';
		})
		.fail(function(res) {
			if (res.body && res.body.errors) {
				alert(res.body.errors[0]);
			}
		});
	return false;
});
$('.form-newuser').on('submit', function(e) {
	alert('Sorry, we\'re not accepting new users at this time.');
	return false;
});