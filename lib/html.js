var fs = require('fs');
module.exports = {
	dashboard: '',
	login_or_signup: '',
	login: '',
	app_auth: '',
	load: function() {
		this.dashboard = fs.readFileSync('./static/dashboard.html').toString();
		this.login_or_signup = fs.readFileSync('./static/login_or_signup.html').toString();
		this.login = fs.readFileSync('./static/login.html').toString();
		this.app_auth = fs.readFileSync('./static/app_auth.html').toString();
	}
};