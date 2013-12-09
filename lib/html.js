var fs = require('fs');
module.exports = {
	dashboard: '',
	login_or_signup: '',
	login: '',
	user_update: '',
	app_auth: '',
	guest_auth: '',
	guest_auth_hostdne: '',
	load: function(config) {
		var welcome = fs.readFileSync('./welcome.html').toString();
		var motd = fs.readFileSync('./motd.html').toString();
		var avatars = fs.readdirSync('./static/img/avatars');

		var port = config.downstream_port || config.port;
		this.dashboard = fs.readFileSync('./static/dashboard.html').toString()
			.replace(/\{HOSTLABEL\}/g, ucfirst(config.hostname)+((port != 80 && port != 443)?':'+port:''))
			.replace(/\{HOSTDOMAIN\}/g, config.url)
			.replace('{MOTD_HTML}', motd)
			.replace('{AVATARS}', JSON.stringify(avatars));
		this.login_or_signup = fs.readFileSync('./static/login_or_signup.html').toString().replace('{WELCOME_HTML}', welcome);
		this.login = fs.readFileSync('./static/login.html').toString().replace('{WELCOME_HTML}', welcome);
		this.user_update = fs.readFileSync('./static/user_update.html').toString();
		this.app_auth = fs.readFileSync('./static/app_auth.html').toString();
		this.guest_auth = fs.readFileSync('./static/guest_auth.html').toString();
		this.guest_auth_hostdne = fs.readFileSync('./static/guest_auth_hostdne.html').toString();
	}
};

function ucfirst(str) {
	return str.slice(0,1).toUpperCase() + str.slice(1);
}